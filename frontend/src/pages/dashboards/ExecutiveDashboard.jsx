import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { getPendingApprovals } from '../../api/approvals'
import { useAuth } from '../../context/AuthContext'
import { Card, CardContent } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import { Avatar, AvatarFallback } from '../../components/ui/avatar'
import { CheckCircle2, ChevronRight, Clock, ArrowRight } from 'lucide-react'

export default function ExecutiveDashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const { data: pending = [], isLoading } = useQuery({
    queryKey: ['approvals', 'pending'],
    queryFn: () => getPendingApprovals().then(r => r.data),
    refetchInterval: 30_000,
  })

  const initials = (user?.name || 'U').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()

  if (isLoading) return (
    <div className="max-w-lg mx-auto pt-10 space-y-4">
      <Skeleton className="h-32 rounded-xl" />
      <Skeleton className="h-48 rounded-xl" />
    </div>
  )

  return (
    <div className="max-w-lg mx-auto pt-10 space-y-6">

      {/* Identity card */}
      <Card>
        <CardContent className="p-6 text-center">
          <Avatar className="h-14 w-14 mx-auto mb-3">
            <AvatarFallback className="bg-primary text-primary-foreground text-lg font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <p className="text-base font-bold text-foreground">{user?.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{user?.roles?.[0]}</p>
        </CardContent>
      </Card>

      {/* Decision status */}
      {pending.length === 0 ? (
        <Card className="border-emerald-200 dark:border-emerald-800">
          <CardContent className="p-10 text-center">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={30} className="text-emerald-500 dark:text-emerald-400" />
            </div>
            <p className="text-lg font-bold text-foreground">Nothing requires your attention</p>
            <p className="text-sm text-muted-foreground mt-1.5">All approvals are up to date.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Counter badge */}
          <Card className="border-amber-200 dark:border-amber-800">
            <CardContent className="p-6 text-center">
              <div className="w-16 h-16 rounded-2xl bg-amber-500 flex items-center justify-center text-white text-3xl font-bold mx-auto mb-3 shadow-sm">
                {pending.length}
              </div>
              <p className="text-base font-bold text-foreground">
                {pending.length === 1 ? 'Decision requires' : 'Decisions require'} your attention
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Review and sign off to keep workflows progressing
              </p>
            </CardContent>
          </Card>

          {/* Items */}
          <div className="space-y-2">
            {pending.map(item => (
              <button
                key={item.approval_instance_id}
                onClick={() => navigate(`/approvals/${item.form_instance_id}`)}
                className="w-full flex items-center justify-between p-4 bg-card rounded-xl border border-border hover:border-primary/50 hover:shadow-md transition-all text-left group"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-foreground truncate">{item.form_name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    From {item.initiator} · <span className="font-mono">{item.reference_number}</span>
                  </p>
                  {item.step_label && (
                    <p className="text-xs text-primary mt-1 font-semibold">{item.step_label}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                  <span className="text-xs bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 px-2.5 py-1 rounded-full font-bold whitespace-nowrap flex items-center gap-1">
                    <Clock size={10} /> Awaiting you
                  </span>
                  <ChevronRight size={16} className="text-muted-foreground/40 group-hover:text-primary transition-colors" />
                </div>
              </button>
            ))}
          </div>

          <Button className="w-full" onClick={() => navigate('/approvals')}>
            Open Approvals Inbox <ArrowRight size={15} />
          </Button>
        </div>
      )}
    </div>
  )
}
