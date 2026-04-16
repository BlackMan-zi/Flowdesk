import * as React from 'react'
import { cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:     'border-transparent bg-primary text-primary-foreground hover:bg-primary/80',
        secondary:   'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive: 'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80',
        outline:     'text-foreground border border-input',
      },
    },
    defaultVariants: { variant: 'default' },
  }
)

// Status colour map
const STATUS_STYLES = {
  Draft:                     'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  Submitted:                 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  Pending:                   'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  'In Progress':             'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  'Returned for Correction': 'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
  Rejected:                  'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
  Approved:                  'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  Completed:                 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  Active:                    'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  Waiting:                   'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  Skipped:                   'bg-slate-50 text-slate-400 dark:bg-slate-900 dark:text-slate-500',
  'Sent Back':               'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
}

const STATUS_DOTS = {
  Draft:                     'bg-slate-400',
  Submitted:                 'bg-blue-500',
  Pending:                   'bg-amber-500',
  'In Progress':             'bg-amber-500',
  'Returned for Correction': 'bg-orange-500',
  Rejected:                  'bg-red-500',
  Approved:                  'bg-emerald-500',
  Completed:                 'bg-emerald-500',
  Active:                    'bg-blue-500',
  Waiting:                   'bg-slate-300',
  Skipped:                   'bg-slate-200',
  'Sent Back':               'bg-orange-500',
}

function Badge({ className, variant, label, showDot = true, children, ...props }) {
  // If label is provided, treat as a status badge
  if (label !== undefined) {
    const statusStyle = STATUS_STYLES[label] || 'bg-slate-100 text-slate-600'
    const dotStyle    = STATUS_DOTS[label]    || 'bg-slate-400'
    return (
      <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold', statusStyle, className)}>
        {showDot && <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', dotStyle)} />}
        {label}
      </span>
    )
  }

  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props}>
      {children}
    </div>
  )
}

export { Badge, badgeVariants }
export default Badge
