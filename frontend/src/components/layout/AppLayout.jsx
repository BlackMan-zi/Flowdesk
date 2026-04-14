import React, { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../context/AuthContext'
import { getPendingApprovals } from '../../api/approvals'
import Sidebar from './Sidebar'
import Header from './Header'

// Stripped layout for executives — no sidebar, no nav clutter
function ExecutiveLayout() {
  const { user, logout } = useAuth()
  return (
    <div className="flex flex-col h-screen bg-slate-50">
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-200">
        <span className="text-sm font-semibold text-slate-700">FlowDesk</span>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">{user?.name}</span>
          <button
            onClick={logout}
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  )
}

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { isApprover, isExecutive } = useAuth()

  const { data: pending = [] } = useQuery({
    queryKey: ['approvals', 'pending'],
    queryFn: () => getPendingApprovals().then(r => r.data),
    enabled: isApprover || isExecutive,
    refetchInterval: 60_000,
  })

  if (isExecutive) return <ExecutiveLayout />

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        pendingCount={pending.length}
      />
      <div className="flex flex-col flex-1 min-w-0">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
