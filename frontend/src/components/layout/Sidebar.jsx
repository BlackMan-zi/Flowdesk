import React from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
  LayoutDashboard, FileText, CheckSquare, Users, Building2,
  FormInput, GitBranch, UserCheck, FileDown, X, Workflow, Activity, Plus
} from 'lucide-react'

const NavItem = ({ to, icon: Icon, label, badge }) => (
  <NavLink
    to={to}
    end={to === '/'}
    className={({ isActive }) =>
      `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
        isActive
          ? 'bg-brand-600 text-white'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      }`
    }
  >
    <Icon size={17} />
    <span className="flex-1">{label}</span>
    {badge != null && badge > 0 && (
      <span className="bg-amber-100 text-amber-700 text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
        {badge}
      </span>
    )}
  </NavLink>
)

const SectionLabel = ({ label }) => (
  <p className="px-3 pt-4 pb-1 text-xs font-semibold text-slate-400 uppercase tracking-wider">
    {label}
  </p>
)

const Logo = ({ onClose }) => (
  <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
    <div className="flex items-center gap-2.5">
      <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
        <Workflow size={18} className="text-white" />
      </div>
      <span className="text-lg font-bold text-slate-900">FlowDesk</span>
    </div>
    {onClose && (
      <button onClick={onClose} className="lg:hidden text-slate-400 hover:text-slate-600">
        <X size={20} />
      </button>
    )}
  </div>
)

// ── Role-specific navigation sets ─────────────────────────────────���──────────

/** Standard User — personal workflow only */
function StandardUserNav({ pendingCount }) {
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
      <NavItem to="/" icon={LayoutDashboard} label="Dashboard" />
      <SectionLabel label="Workflow" />
      <NavItem to="/approvals" icon={CheckSquare} label="Approvals" badge={pendingCount} />
      <NavItem to="/my-forms" icon={FileText} label="My Forms" />
      <NavItem to="/my-forms/new" icon={Plus} label="New Request" />
      <NavItem to="/delegations" icon={UserCheck} label="Delegations" />
      <NavItem to="/documents" icon={FileDown} label="Documents" />
    </nav>
  )
}

/** Report Manager — department-level visibility, no system config */
function ReportManagerNav({ pendingCount }) {
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
      <NavItem to="/" icon={LayoutDashboard} label="Dashboard" />
      <SectionLabel label="Workflow" />
      <NavItem to="/approvals" icon={CheckSquare} label="Approvals" badge={pendingCount} />
      <NavItem to="/my-forms" icon={FileText} label="My Forms" />
      <NavItem to="/my-forms/new" icon={Plus} label="New Request" />
      <NavItem to="/delegations" icon={UserCheck} label="Delegations" />
      <NavItem to="/documents" icon={FileDown} label="Documents" />
    </nav>
  )
}

/** Executive — pending decisions focus */
function ExecutiveNav({ pendingCount }) {
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
      <NavItem to="/" icon={LayoutDashboard} label="Dashboard" />
      <SectionLabel label="Workflow" />
      <NavItem to="/approvals" icon={CheckSquare} label="Approvals" badge={pendingCount} />
      <NavItem to="/my-forms" icon={FileText} label="My Forms" />
      <NavItem to="/my-forms/new" icon={Plus} label="New Request" />
      <NavItem to="/documents" icon={FileDown} label="Documents" />
    </nav>
  )
}

/** Admin — full system access */
function AdminNav() {
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
      <NavItem to="/" icon={LayoutDashboard} label="Dashboard" />

      <SectionLabel label="Workflow" />
      <NavItem to="/approvals" icon={CheckSquare} label="Approvals" />
      <NavItem to="/my-forms" icon={FileText} label="My Forms" />
      <NavItem to="/delegations" icon={UserCheck} label="Delegations" />
      <NavItem to="/documents" icon={FileDown} label="Documents" />

      <SectionLabel label="Configuration" />
      <NavItem to="/admin/users" icon={Users} label="Users" />
      <NavItem to="/admin/departments" icon={Building2} label="Departments" />
      <NavItem to="/admin/form-definitions" icon={FormInput} label="Form Definitions" />
      <NavItem to="/admin/approval-templates" icon={GitBranch} label="Approval Templates" />
      <NavItem to="/admin/delegations" icon={UserCheck} label="All Delegations" />
      <NavItem to="/logs" icon={Activity} label="Logs" />
    </nav>
  )
}

/** Observer — read-only */
function ObserverNav() {
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
      <NavItem to="/" icon={FileDown} label="Documents" />
    </nav>
  )
}

// ── Main Sidebar ──────────────────────────────────────────────────────────────

export default function Sidebar({ open, onClose, pendingCount = 0 }) {
  const { isAdmin, isReportManager, isExecutive, isObserver } = useAuth()

  const renderNav = () => {
    if (isAdmin)          return <AdminNav />
    if (isReportManager)  return <ReportManagerNav pendingCount={pendingCount} />
    if (isExecutive)      return <ExecutiveNav pendingCount={pendingCount} />
    if (isObserver)       return <ObserverNav />
    return <StandardUserNav pendingCount={pendingCount} />
  }

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-20 bg-black/30 lg:hidden" onClick={onClose} />
      )}
      <aside className={`
        fixed inset-y-0 left-0 z-30 w-64 bg-white border-r border-slate-200 flex flex-col
        transform transition-transform duration-200
        lg:static lg:translate-x-0
        ${open ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <Logo onClose={onClose} />
        {renderNav()}
      </aside>
    </>
  )
}
