import React, { useState } from 'react'
import { Menu, LogOut, User, ChevronDown } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useNavigate } from 'react-router-dom'

export default function Header({ onMenuClick }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [dropOpen, setDropOpen] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
      <button
        onClick={onMenuClick}
        className="lg:hidden p-1.5 rounded-md text-slate-500 hover:bg-slate-100"
      >
        <Menu size={20} />
      </button>

      <div className="flex-1 lg:flex-none" />

      <div className="relative">
        <button
          onClick={() => setDropOpen(p => !p)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <div className="w-7 h-7 rounded-full bg-brand-600 flex items-center justify-center text-white text-xs font-bold">
            {user?.name?.[0]?.toUpperCase() || 'U'}
          </div>
          <div className="hidden sm:block text-left">
            <p className="text-sm font-medium text-slate-800 leading-none">{user?.name}</p>
            <p className="text-xs text-slate-500 mt-0.5">{user?.roles?.[0] || 'User'}</p>
          </div>
          <ChevronDown size={14} className="text-slate-400" />
        </button>

        {dropOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setDropOpen(false)} />
            <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-slate-200 z-20 py-1">
              <div className="px-4 py-2 border-b border-slate-100">
                <p className="text-xs text-slate-500 truncate">{user?.email}</p>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                <LogOut size={14} />
                Sign out
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  )
}
