import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { getApproverDashboard, getInitiatorDashboard } from '../../api/dashboard'
import { useAuth } from '../../context/AuthContext'
import { Card, CardContent } from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { SkeletonDashboard } from '../../components/ui/Skeleton'
import {
  Clock, CheckCircle2, XCircle, ChevronRight, AlertTriangle,
  Plus, FileText,
} from 'lucide-react'

export default function HodDashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const { data: approverData, isLoading: loadingApprover } = useQuery({
    queryKey: ['dashboard', 'approver'],
    queryFn: () => getApproverDashboard().then(r => r.data),
    refetchInterval: 30_000,
  })

  const { data: initiatorData, isLoading: loadingInitiator } = useQuery({
    queryKey: ['dashboard', 'initiator'],
    queryFn: () => getInitiatorDashboard().then(r => r.data),
  })

  if (loadingApprover && loadingInitiator) return <SkeletonDashboard />

  const pending        = approverData?.pending || []
  const counts         = approverData?.counts  || {}
  const byStatus       = initiatorData?.by_status || {}
  const myTotal        = initiatorData?.total || 0

  const urgentCount    = pending.filter(p => p.days_waiting >= 5).length
  const myPending      = (byStatus['Pending'] || []).length
  const myRejected     = (byStatus['Rejected'] || []).length || 0
  const myCorrection   = (byStatus['Returned for Correction'] || []).length || 0

  const recentOwn = Object.entries(byStatus)
    .flatMap(([status, items]) => items.map(item => ({ ...item, current_status: status })))
    .sort((a, b) => new Date(b.submitted_at || b.created_at) - new Date(a.submitted_at || a.created_at))
    .slice(0, 5)

  return (
    <div className="max-w-3xl space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">
            Welcome, {user?.name?.split(' ')[0] || 'HOD'}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Head of Department · approval queue &amp; your submissions
          </p>
        </div>
        <Button size="sm" onClick={() => navigate('/my-forms/new')}>
          <Plus size={14} className="mr-1" /> New Request
        </Button>
      </div>

      {/* Approval queue card */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground">Approval Queue</h2>
          <Button variant="ghost" size="sm" onClick={() => navigate('/approvals')} className="text-xs">
            View all <ChevronRight size={12} />
          </Button>
        </div>

        <Card className={pending.length > 0 ? 'border-amber-200 dark:border-amber-800' : 'border-emerald-200 dark:border-emerald-800'}>
          <CardContent className="p-4">
            <div className="flex items-center gap-4 mb-4">
              <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-xl font-bold flex-shrink-0 ${
                pending.length > 0 ? 'bg-amber-500 text-white' : 'bg-emerald-500 text-white'
              }`}>
                {pending.length}
              </div>
              <div>
                <p className="font-bold text-foreground">
                  {pending.length === 0 ? 'All clear' :
                   pending.length === 1 ? '1 form awaiting your approval' :
                   `${pending.length} forms awaiting your approval`}
                </p>
                {urgentCount > 0 && (
                  <p className="text-xs text-red-600 font-semibold mt-0.5 flex items-center gap-1">
                    <AlertTriangle size={11} /> {urgentCount} overdue
                  </p>
                )}
              </div>
            </div>

            {pending.length > 0 && (
              <div className="divide-y divide-border">
                {pending.slice(0, 5).map(item => (
                  <div key={item.approval_instance_id}
                    className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{item.form_name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {item.initiator} · <span className="font-mono">{item.reference_number}</span>
                        {item.days_waiting > 0 && (
                          <span className={`ml-2 font-medium ${item.days_waiting >= 5 ? 'text-red-500' : item.days_waiting >= 3 ? 'text-orange-500' : 'text-muted-foreground'}`}>
                            {item.days_waiting}d waiting
                          </span>
                        )}
                      </p>
                    </div>
                    <Button size="sm" className="ml-3 flex-shrink-0"
                      onClick={() => navigate(`/approvals/${item.form_instance_id}`)}
                    >
                      Review <ChevronRight size={12} />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* My decisions summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <CheckCircle2 size={18} className="text-emerald-500 mx-auto mb-1" />
            <p className="text-xl font-bold text-foreground">{counts.approved ?? 0}</p>
            <p className="text-xs text-muted-foreground">Approved by me</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <XCircle size={18} className="text-red-500 mx-auto mb-1" />
            <p className="text-xl font-bold text-foreground">{counts.rejected ?? 0}</p>
            <p className="text-xs text-muted-foreground">Rejected by me</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Clock size={18} className="text-amber-500 mx-auto mb-1" />
            <p className="text-xl font-bold text-foreground">{myPending}</p>
            <p className="text-xs text-muted-foreground">My pending forms</p>
          </CardContent>
        </Card>
      </div>

      {/* My submissions */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground">
            My Submissions
            {myTotal > 0 && <span className="ml-2 text-muted-foreground font-normal">({myTotal} total)</span>}
          </h2>
          <Button variant="ghost" size="sm" onClick={() => navigate('/my-forms')} className="text-xs">
            View all <ChevronRight size={12} />
          </Button>
        </div>

        {myRejected > 0 || myCorrection > 0 ? (
          <div className="flex gap-2 mb-3">
            {myRejected > 0 && (
              <span className="text-xs font-semibold bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 px-2 py-1 rounded-lg">
                {myRejected} rejected
              </span>
            )}
            {myCorrection > 0 && (
              <span className="text-xs font-semibold bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-300 px-2 py-1 rounded-lg">
                {myCorrection} needs correction
              </span>
            )}
          </div>
        ) : null}

        <Card>
          <CardContent className="p-0">
            {recentOwn.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-muted-foreground gap-2">
                <FileText size={28} className="opacity-30" />
                <p className="text-sm">No submissions yet</p>
                <Button size="sm" variant="outline" onClick={() => navigate('/my-forms/new')}>
                  <Plus size={13} className="mr-1" /> Start a request
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {recentOwn.map(item => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => navigate(`/my-forms/${item.id}`)}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{item.form_name}</p>
                      <p className="text-xs font-mono text-muted-foreground mt-0.5">{item.reference_number}</p>
                    </div>
                    <Badge>{item.current_status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

    </div>
  )
}
