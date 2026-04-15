import React from 'react'
import { Menu, LogOut, User } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useNavigate, useLocation } from 'react-router-dom'
import { Button } from '../ui/Button'
import { Avatar, AvatarFallback } from '../ui/avatar'
import { ThemeToggle } from '../ui/theme-toggle'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '../ui/dropdown-menu'

const PAGE_TITLES = {
  '/':                         { title: 'Dashboard',          sub: 'Overview & analytics' },
  '/my-forms':                 { title: 'My Forms',            sub: 'Your submissions & requests' },
  '/my-forms/new':             { title: 'New Request',         sub: 'Submit a new form' },
  '/approvals':                { title: 'Approvals',           sub: 'Review pending requests' },
  '/approvals/history':        { title: 'Approval History',    sub: 'Your past decisions' },
  '/delegations':              { title: 'Delegations',         sub: 'Manage your delegations' },
  '/documents':                { title: 'Documents',           sub: 'Generated & shared files' },
  '/admin/users':              { title: 'User Management',     sub: 'Manage user accounts & roles' },
  '/admin/departments':        { title: 'Departments',         sub: 'Organisational structure' },
  '/admin/form-definitions':   { title: 'Form Definitions',   sub: 'Design and manage form types' },
  '/admin/approval-templates': { title: 'Approval Templates', sub: 'Configure workflow steps' },
  '/admin/delegations':        { title: 'All Delegations',    sub: 'System-wide delegation rules' },
  '/logs':                     { title: 'Audit Logs',          sub: 'System activity and events' },
}

function getPageTitle(pathname) {
  const exact = PAGE_TITLES[pathname]
  if (exact) return exact
  if (pathname.startsWith('/my-forms/'))  return { title: 'Request Detail',  sub: 'Form details & status' }
  if (pathname.startsWith('/approvals/')) return { title: 'Review Request',  sub: 'Approve or reject' }
  return { title: 'FlowDesk', sub: '' }
}

export default function Header({ onMenuClick }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const { title, sub } = getPageTitle(location.pathname)
  const initials = (user?.name || 'U').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()

  const handleLogout = () => { logout(); navigate('/login') }

  return (
    <header className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border px-4 lg:px-6 py-2.5 flex items-center justify-between">
      {/* Left */}
      <div className="flex items-center gap-3 min-w-0">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden h-8 w-8"
          onClick={onMenuClick}
          aria-label="Open menu"
        >
          <Menu size={18} />
        </Button>
        <div className="min-w-0 hidden sm:block">
          <h2 className="text-sm font-semibold text-foreground truncate leading-tight">{title}</h2>
          {sub && <p className="text-xs text-muted-foreground truncate leading-tight mt-0.5">{sub}</p>}
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-1.5">
        <ThemeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 h-8 px-2">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="bg-primary text-primary-foreground text-[11px] font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="hidden sm:block text-sm font-medium max-w-[120px] truncate">
                {user?.name}
              </span>
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-semibold">{user?.name}</p>
                <p className="text-xs text-muted-foreground font-normal truncate">{user?.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-normal">
              <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-md text-xs font-medium">
                {user?.roles?.[0] || 'User'}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
