import React, { useState } from 'react'
import Card from '../ui/Card'
import { History, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'

// Shared between ApprovalAction, FormDetail, and SubmitForm. Renders the
// version timeline for a form instance: each version's number, creation
// date, the submitter's change notes, and — if a step on that version
// was sent back — the approver's correction note in an orange callout.
//
// Returns null when the form only has a single version (no history to
// show), so callers can drop it in unconditionally.
export default function VersionHistory({ versions, currentVersion }) {
  const [open, setOpen] = useState(false)
  if (!versions || versions.length <= 1) return null

  const sorted = [...versions].sort((a, b) => b.version_number - a.version_number)

  return (
    <Card>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-sm font-semibold text-foreground hover:bg-muted/40 transition-colors rounded-xl"
      >
        <div className="flex items-center gap-2">
          <History size={15} className="text-muted-foreground" />
          Version History
          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
            {versions.length} versions
          </span>
        </div>
        <span className="text-xs text-muted-foreground">{open ? 'Collapse ▲' : 'Expand ▼'}</span>
      </button>

      {open && (
        <div className="border-t border-border divide-y divide-border">
          {sorted.map(ver => {
            const isCurrent = ver.version_number === currentVersion
            const sentBackStep = ver.approval_instances?.find(
              a => a.status === 'sent_back' || a.status === 'Sent Back' || a.status === 'SendBack'
            )
            return (
              <div key={ver.id} className={cn('px-5 py-3', isCurrent && 'bg-primary/5')}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={cn('text-xs font-bold px-2 py-0.5 rounded',
                    isCurrent ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  )}>
                    v{ver.version_number}
                  </span>
                  {isCurrent && <span className="text-xs text-primary font-medium">Current</span>}
                  <span className="text-xs text-muted-foreground ml-auto">
                    {ver.created_at && new Date(ver.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>
                {ver.change_notes && (
                  <p className="text-xs text-muted-foreground italic">Submitter note: "{ver.change_notes}"</p>
                )}
                {sentBackStep && (
                  <div className="mt-1.5 flex items-start gap-1.5 bg-orange-50 border border-orange-200 rounded px-2.5 py-1.5 dark:bg-orange-900/20 dark:border-orange-800">
                    <RotateCcw size={11} className="text-orange-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-orange-800 font-medium dark:text-orange-300">
                        Sent back by {sentBackStep.approver?.name || 'approver'}
                        {sentBackStep.delegated_from?.name && (
                          <span className="font-normal"> (acting for {sentBackStep.delegated_from.name})</span>
                        )}
                      </p>
                      {sentBackStep.notes && (
                        <p className="text-xs text-orange-700 italic mt-0.5 dark:text-orange-400">"{sentBackStep.notes}"</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

// Compact callout used in SubmitForm-edit mode. Surfaces ONLY the most
// recent "sent back" step on the prior version so the corrector sees the
// reason without having to expand history. Pass the current versions array
// and the current_version number; component picks the most recent
// superseded version with a sent_back step.
export function CorrectionNoteBanner({ versions, currentVersion }) {
  if (!versions || versions.length === 0) return null
  // Find the most recent prior version that has a sent_back step
  const prior = [...versions]
    .filter(v => v.version_number < currentVersion)
    .sort((a, b) => b.version_number - a.version_number)
  let lastSentBack = null
  let priorVersion = null
  for (const v of prior) {
    const sb = v.approval_instances?.find(
      a => a.status === 'sent_back' || a.status === 'Sent Back' || a.status === 'SendBack'
    )
    if (sb) { lastSentBack = sb; priorVersion = v; break }
  }
  if (!lastSentBack) return null

  return (
    <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 dark:bg-orange-900/20 dark:border-orange-800">
      <div className="flex items-start gap-2">
        <RotateCcw size={16} className="text-orange-600 dark:text-orange-400 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-orange-900 dark:text-orange-300">
            Sent back from v{priorVersion?.version_number} by {lastSentBack.approver?.name || 'an approver'}
            {lastSentBack.delegated_from?.name && (
              <span className="font-normal"> (acting for {lastSentBack.delegated_from.name})</span>
            )}
          </p>
          {lastSentBack.notes && (
            <p className="text-xs text-orange-800 dark:text-orange-400 mt-1 italic">"{lastSentBack.notes}"</p>
          )}
          <p className="text-[11px] text-orange-700 dark:text-orange-500 mt-1.5">
            Apply the requested changes below, then sign and submit again — the workflow restarts from step 1.
          </p>
        </div>
      </div>
    </div>
  )
}
