import React, { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { cn } from '@/lib/utils'
import { ScrollArea } from '../ui/scroll-area'
import { Separator } from '../ui/separator'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible'
import {
  LayoutDashboard, FileText, CheckSquare, Users, Building2,
  FormInput, GitBranch, UserCheck, FileDown, X, Workflow,
  Activity, Plus, ChevronRight, Settings
} from 'lucide-react'

// ── Nav item ──────────────────────────────────────────────────────────────────

function NavItem({ to, icon: Icon, label, badge, end: endProp }) {
  return (
    <NavLink
      to={to}
      end={endProp ?? (to === '/')}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors group',
          isActive
            ? 'bg-sidebar-primary text-sidebar-primary-foreground'
            : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon size={16} className={cn('flex-shrink-0', isActive ? 'opacity-100' : 'opacity-60 group-hover:opacity-80')} />
          <span className="flex-1 truncate">{label}</span>
          {badge != null && badge > 0 && (
            <span className="bg-amber-400 text-amber-900 text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-tight">
              {badge > 99 ? '99+' : badge}
            </span>
          )}
        </>
      )}
    </NavLink>
  )
}

function SectionLabel({ label }) {
  return (
    <p className="px-3 pt-4 pb-1 text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-widest">
      {label}
    </p>
  )
}

// ── Role nav sets ──────────────────────────────────────────────────────────────

function StandardUserNav({ pendingCount }) {
  return (
    <div className="space-y-0.5">
      <NavItem to="/" icon={LayoutDashboard} label="Dashboard" />
      <SectionLabel label="Workflow" />
      <NavItem to="/approvals" icon={CheckSquare} label="Approvals" badge={pendingCount} />
      <NavItem to="/my-forms" icon={FileText} label="My Forms" />
      <NavItem to="/my-forms/new" icon={Plus} label="New Request" />
      <NavItem to="/delegations" icon={UserCheck} label="Delegations" />
      <NavItem to="/documents" icon={FileDown} label="Documents" />
    </div>
  )
}

function ReportManagerNav({ pendingCount }) {
  return (
    <div className="space-y-0.5">
      <NavItem to="/" icon={LayoutDashboard} label="Dashboard" />
      <SectionLabel label="Workflow" />
      <NavItem to="/approvals" icon={CheckSquare} label="Approvals" badge={pendingCount} />
      <NavItem to="/my-forms" icon={FileText} label="My Forms" />
      <NavItem to="/my-forms/new" icon={Plus} label="New Request" />
      <NavItem to="/delegations" icon={UserCheck} label="Delegations" />
      <NavItem to="/documents" icon={FileDown} label="Documents" />
    </div>
  )
}

function AdminNav() {
  const [configOpen, setConfigOpen] = useState(true)

  return (
    <div className="space-y-0.5">
      <NavItem to="/" icon={LayoutDashboard} label="Dashboard" />

      <SectionLabel label="Workflow" />
      <NavItem to="/approvals" icon={CheckSquare} label="Approvals" />
      <NavItem to="/my-forms" icon={FileText} label="My Forms" />
      <NavItem to="/delegations" icon={UserCheck} label="Delegations" />
      <NavItem to="/documents" icon={FileDown} label="Documents" />

      <Separator className="bg-sidebar-border my-2" />

      <Collapsible open={configOpen} onOpenChange={setConfigOpen}>
        <CollapsibleTrigger className="flex items-center gap-3 px-3 py-2 w-full text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-widest hover:text-sidebar-foreground/60 transition-colors">
          <Settings size={11} />
          Configuration
          <ChevronRight size={11} className={cn('ml-auto transition-transform', configOpen && 'rotate-90')} />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-0.5">
          <NavItem to="/admin/users" icon={Users} label="Users" />
          <NavItem to="/admin/departments" icon={Building2} label="Departments" />
          <NavItem to="/admin/form-definitions" icon={FormInput} label="Form Definitions" />
          <NavItem to="/admin/approval-templates" icon={GitBranch} label="Approval Templates" />
          <NavItem to="/admin/delegations" icon={UserCheck} label="All Delegations" />
          <NavItem to="/logs" icon={Activity} label="Audit Logs" />
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

function ObserverNav() {
  return (
    <div className="space-y-0.5">
      <NavItem to="/" icon={FileDown} label="Documents" />
    </div>
  )
}

// ── Main Sidebar ───────────────────────────────────────────────────────────────

export default function Sidebar({ open, onClose, pendingCount = 0 }) {
  const { isAdmin, isReportManager, isExecutive, isObserver, isHod } = useAuth()

  const renderNav = () => {
    if (isAdmin)         return <AdminNav />
    if (isReportManager) return <ReportManagerNav pendingCount={pendingCount} />
    if (isHod)           return <StandardUserNav pendingCount={pendingCount} />
    if (isExecutive)     return <StandardUserNav pendingCount={pendingCount} />
    if (isObserver)      return <ObserverNav />
    return <StandardUserNav pendingCount={pendingCount} />
  }

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-20 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 w-64 flex flex-col',
          'bg-sidebar text-sidebar-foreground border-r border-sidebar-border',
          'transform transition-transform duration-200 ease-in-out',
          'lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-sidebar-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-sidebar-primary rounded-lg flex items-center justify-center shadow-sm">
              <Workflow size={16} className="text-sidebar-primary-foreground" />
            </div>
            <div>
              <span className="text-sm font-bold text-sidebar-foreground tracking-tight">FlowDesk</span>
              <p className="text-[10px] text-sidebar-foreground/40 leading-none mt-0.5">Workflow Platform</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden p-1 rounded-md text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Nav */}
        <ScrollArea className="flex-1 px-3 py-3">
          {renderNav()}
        </ScrollArea>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-sidebar-border">
          <p className="text-[10px] text-sidebar-foreground/30">v1.0 · FlowDesk</p>
        </div>
      </aside>
    </>
  )
}
