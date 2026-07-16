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
  const roleCategories = new Set(user?.role_categories || [])

  // ── Privilege tiers ──────────────────────────────────────────────────────────
  // Admin: full system access + configuration
  const isAdmin = roles.includes('Admin')

  // Report Manager: create users + see reports/dashboard, no system config
  const isReportManager = roles.includes('Report Manager') && !isAdmin

  // Executive: C-suite approvers (anyone with executive role category)
  const isExecutive = roleCategories.has('executive') && !isAdmin && !isReportManager

  // Observer: read-only documents view
  const isObserver = roles.includes('Observer') && !isAdmin && !isReportManager && !isExecutive

  // HOD: Head of Department, needs both approver queue and own form submissions
  const isHod = roles.includes('HOD') && !isAdmin && !isReportManager

  // Approver: admin, report manager, or any functional/executive/hierarchy role holder
  const isApprover = isAdmin || isReportManager ||
    roleCategories.has('functional') ||
    roleCategories.has('executive') ||
    roleCategories.has('hierarchy')

  return (
    <AuthContext.Provider value={{
      user, login, logout, updateUser,
      isAdmin, isReportManager, isApprover, isExecutive, isObserver, isHod
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
