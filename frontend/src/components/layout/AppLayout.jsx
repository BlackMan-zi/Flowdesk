import React, { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../context/AuthContext'
import { getPendingApprovals } from '../../api/approvals'
import { Workflow, LogOut } from 'lucide-react'
import Sidebar from './Sidebar'
import Header from './Header'
import { Button } from '../ui/Button'
import { ThemeToggle } from '../ui/theme-toggle'

// Minimal executive layout — no sidebar
function ExecutiveLayout() {
  const { user, logout } = useAuth()
  const initials = (user?.name || 'U').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()

  return (
    <div className="flex flex-col h-screen bg-background">
      <div className="flex items-center justify-between px-6 py-3 bg-card border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center shadow-sm">
            <Workflow size={16} className="text-primary-foreground" />
          </div>
          <span className="text-sm font-bold text-foreground tracking-tight">FlowDesk</span>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <span className="text-sm text-muted-foreground hidden sm:block">{user?.name}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { logout() }}
            className="text-muted-foreground hover:text-destructive gap-1.5"
          >
            <LogOut size={13} />
            Sign out
          </Button>
        </div>
      </div>
      <main className="flex-1 overflow-y-auto p-6">
        <div className="animate-fade-in">
          <Outlet />
        </div>
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
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        pendingCount={pending.length}
      />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="animate-fade-in">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
