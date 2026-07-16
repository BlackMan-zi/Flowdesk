import React, { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from './AuthContext'

// Same basename detection as App.jsx: production is mounted at /flowdesk;
// local dev runs at /. EventSource needs an absolute path either way.
const API_BASE = window.location.pathname.startsWith('/flowdesk') ? '/flowdesk/api' : '/api'

// Queries that any workflow change can invalidate. Lists are over-broad on
// purpose: we'd rather refetch a card that didn't strictly need it than
// miss one that did. React Query dedupes refetches across components, so
// the actual network cost is one request per active key.
const INVALIDATE_KEYS = [
  ['approvals'],
  ['form-instances'],
  ['form-instance'],
  ['dashboard'],
  ['documents'],
]

/**
 * Opens a Server-Sent Events stream while the user is logged in and
 * invalidates React Query caches when a workflow event arrives, replacing
 * the 1-second polling we used to have on My Forms / Approvals. The browser
 * auto-reconnects EventSource on transient network errors; we manually
 * tear down on logout / token change.
 */
export function RealtimeProvider({ children }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const esRef = useRef(null)

  useEffect(() => {
    if (!user) {
      esRef.current?.close()
      esRef.current = null
      return
    }
    const token = localStorage.getItem('fd_token')
    if (!token) return

    const url = `${API_BASE}/events/stream?token=${encodeURIComponent(token)}`
    const es = new EventSource(url)
    esRef.current = es

    const invalidate = () => {
      for (const key of INVALIDATE_KEYS) {
        queryClient.invalidateQueries({ queryKey: key })
      }
    }

    // Named event from the backend; addEventListener (not onmessage) is
    // required to receive specific `event: workflow.changed` lines.
    es.addEventListener('workflow.changed', invalidate)

    // Hello arrives once per (re)connect; useful for debugging.
    es.addEventListener('hello', () => {
      // no-op; presence proves the stream is live
    })

    es.onerror = () => {
      // Browser auto-reconnects after ~3s. If the token's expired, repeated
      // 401s will close the stream; the next login mounts a fresh one via
      // the effect above.
    }

    return () => {
      es.close()
      esRef.current = null
    }
  }, [user, queryClient])

  return children
}
