import React, { createContext, useContext, useState, useCallback } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('fd_user')) } catch { return null }
  })

  const login = useCallback((token, userData) => {
    localStorage.setItem('fd_token', token)
    localStorage.setItem('fd_user', JSON.stringify(userData))
    setUser(userData)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('fd_token')
    localStorage.removeItem('fd_user')
    setUser(null)
  }, [])

  const updateUser = useCallback((userData) => {
    localStorage.setItem('fd_user', JSON.stringify(userData))
    setUser(userData)
  }, [])

  const roles = user?.roles || []

  // ── Privilege tiers ──────────────────────────────────────────────────────────
  // Admin: full system access + configuration
  const isAdmin = roles.includes('Admin')

  // Report Manager: create users + see reports/dashboard, no system config
  const isReportManager = roles.includes('Report Manager') && !isAdmin

  // Executive: C-suite approvers
  const isExecutive = roles.some(r => ['CFO', 'CEO', 'Chief Corporate'].includes(r)) && !isAdmin && !isReportManager

  // Observer: read-only documents view
  const isObserver = roles.includes('Observer') && !isAdmin && !isReportManager && !isExecutive

  // Approver: anyone who signs forms
  const isApprover = roles.some(r =>
    ['Admin', 'Report Manager', 'Manager', 'SN Manager', 'HOD',
     'HR', 'HR & Admin', 'Finance', 'Supply Chain', 'IT',
     'CFO', 'CEO', 'Chief Corporate'].includes(r)
  )

  return (
    <AuthContext.Provider value={{
      user, login, logout, updateUser,
      isAdmin, isReportManager, isApprover, isExecutive, isObserver
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
