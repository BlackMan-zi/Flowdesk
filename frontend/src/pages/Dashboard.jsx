import React from 'react'
import { useAuth } from '../context/AuthContext'
import AdminDashboard         from './dashboards/AdminDashboard'
import ReportManagerDashboard from './dashboards/ReportManagerDashboard'
import ExecutiveDashboard     from './dashboards/ExecutiveDashboard'
import ApproverDashboard      from './dashboards/ApproverDashboard'
import HodDashboard           from './dashboards/HodDashboard'
import ObserverDashboard      from './dashboards/ObserverDashboard'
import InitiatorDashboard     from './dashboards/InitiatorDashboard'

export default function Dashboard() {
  const { isAdmin, isReportManager, isExecutive, isObserver, isApprover, isHod } = useAuth()

  if (isAdmin)          return <AdminDashboard />
  if (isReportManager)  return <ReportManagerDashboard />
  if (isHod)            return <HodDashboard />
  if (isExecutive)      return <ExecutiveDashboard />
  if (isObserver)       return <ObserverDashboard />
  if (isApprover)       return <ApproverDashboard />
  return <InitiatorDashboard />
}
