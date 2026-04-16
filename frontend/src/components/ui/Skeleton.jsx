import * as React from 'react'
import { cn } from '@/lib/utils'

function Skeleton({ className, ...props }) {
  return (
    <div className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />
  )
}

export function SkeletonLine({ className = '' }) {
  return <Skeleton className={cn('h-4 rounded-lg', className)} />
}

export function SkeletonMetricCard() {
  return (
    <div className="rounded-xl border bg-card p-5 space-y-3">
      <Skeleton className="w-10 h-10 rounded-xl" />
      <Skeleton className="h-7 w-16 rounded-lg" />
      <Skeleton className="h-3 w-20 rounded" />
    </div>
  )
}

export function SkeletonRow({ cols = 3 }) {
  return (
    <div className="flex items-center gap-4 px-4 py-3.5 border-b border-border last:border-0">
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton key={i} className={cn('h-4 rounded-lg', i === 0 ? 'flex-1' : 'w-20')} />
      ))}
    </div>
  )
}

export function SkeletonCard({ rows = 4, title = true }) {
  return (
    <div className="rounded-xl border bg-card shadow-sm">
      {title && (
        <div className="px-6 py-4 border-b border-border">
          <Skeleton className="h-4 w-32 rounded-lg" />
        </div>
      )}
      {Array.from({ length: rows }).map((_, i) => <SkeletonRow key={i} />)}
    </div>
  )
}

export function SkeletonDashboard() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-7 w-48 rounded-lg" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <SkeletonMetricCard key={i} />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SkeletonCard rows={3} />
        <SkeletonCard rows={3} />
      </div>
    </div>
  )
}

export function SkeletonFormDetail() {
  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center gap-3">
        <Skeleton className="w-9 h-9 rounded-xl" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-5 w-48 rounded-lg" />
          <Skeleton className="h-3 w-28 rounded" />
        </div>
      </div>
      <SkeletonCard rows={5} />
      <SkeletonCard rows={3} />
    </div>
  )
}

export { Skeleton }
export default Skeleton
