import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import AppLayout from './components/layout/AppLayout'

import Login from './pages/Login'
import ForcePasswordReset from './pages/ForcePasswordReset'
import Dashboard from './pages/Dashboard'
import MyForms from './pages/MyForms'
import SubmitForm from './pages/SubmitForm'
import FormDetail from './pages/FormDetail'
import ApprovalsInbox from './pages/ApprovalsInbox'
import ApprovalAction from './pages/ApprovalAction'
import Delegations from './pages/Delegations'
import Documents from './pages/Documents'
import AdminUsers from './pages/admin/Users'
import AdminDepartments from './pages/admin/Departments'
import AdminFormDefinitions from './pages/admin/FormDefinitions'
import AdminApprovalTemplates from './pages/admin/ApprovalTemplates'
import AdminDelegations from './pages/admin/Delegations'
import FormBuilder from './pages/admin/FormBuilder'
import Logs from './pages/Logs'

function RequireAuth({ children }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (user.must_reset_password) return <Navigate to="/force-reset-password" replace />
  return children
}

function RequireAdmin({ children }) {
  const { user, isAdmin } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (!isAdmin) return <Navigate to="/" replace />
  return children
}


function AppRoutes() {
  const { user } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/force-reset-password" element={<ForcePasswordReset />} />

      {/* Full-screen routes — no AppLayout wrapper */}
      <Route
        path="admin/form-definitions/:id/builder"
        element={<RequireAdmin><FormBuilder /></RequireAdmin>}
      />

      <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
        <Route index element={<Dashboard />} />
        <Route path="my-forms" element={<MyForms />} />
        <Route path="my-forms/new" element={<SubmitForm />} />
        <Route path="my-forms/:id" element={<FormDetail />} />
        <Route path="approvals" element={<ApprovalsInbox />} />
        <Route path="approvals/history" element={<ApprovalsInbox initialTab="history" />} />
        <Route path="approvals/:formInstanceId" element={<ApprovalAction />} />
        <Route path="delegations" element={<Delegations />} />
        <Route path="documents" element={<Documents />} />

        {/* Admin only — user management */}
        <Route path="admin/users" element={<RequireAdmin><AdminUsers /></RequireAdmin>} />

        {/* Admin only */}
        <Route path="logs" element={<RequireAdmin><Logs /></RequireAdmin>} />
        <Route path="admin/departments" element={<RequireAdmin><AdminDepartments /></RequireAdmin>} />
        <Route path="admin/form-definitions" element={<RequireAdmin><AdminFormDefinitions /></RequireAdmin>} />
        <Route path="admin/approval-templates" element={<RequireAdmin><AdminApprovalTemplates /></RequireAdmin>} />
        <Route path="admin/delegations" element={<RequireAdmin><AdminDelegations /></RequireAdmin>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  )
}
