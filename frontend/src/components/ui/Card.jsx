import * as React from 'react'
import { cn } from '@/lib/utils'

const Card = React.forwardRef(({ className, hover, onClick, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'rounded-xl border bg-card text-card-foreground shadow-sm',
      (hover || onClick) && 'cursor-pointer hover:shadow-md transition-shadow duration-200',
      className
    )}
    onClick={onClick}
    {...props}
  />
))
Card.displayName = 'Card'

const CardHeader = React.forwardRef(({ className, title, subtitle, action, children, ...props }, ref) => {
  if (title || subtitle || action) {
    return (
      <div
        ref={ref}
        className={cn('flex items-center justify-between px-6 py-4 border-b border-border', className)}
        {...props}
      >
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
    )
  }
  return (
    <div ref={ref} className={cn('flex flex-col space-y-1.5 p-6', className)} {...props}>
      {children}
    </div>
  )
})
CardHeader.displayName = 'CardHeader'

const CardTitle = React.forwardRef(({ className, ...props }, ref) => (
  <h3 ref={ref} className={cn('text-lg font-semibold leading-none tracking-tight', className)} {...props} />
))
CardTitle.displayName = 'CardTitle'

const CardDescription = React.forwardRef(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
))
CardDescription.displayName = 'CardDescription'

const CardContent = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
))
CardContent.displayName = 'CardContent'

const CardFooter = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('flex items-center p-6 pt-0', className)} {...props} />
))
CardFooter.displayName = 'CardFooter'

// Legacy MetricCard kept for backward compat
function MetricCard({ label, value, icon: Icon, colorClass, accentClass, alert, onClick, trend }) {
  return (
    <Card
      onClick={onClick}
      className={cn(
        'relative overflow-hidden p-5',
        alert && 'border-orange-300 ring-1 ring-orange-200',
        onClick && 'cursor-pointer'
      )}
    >
      <div className={cn('absolute top-0 left-0 right-0 h-0.5', accentClass || 'bg-gradient-to-r from-primary to-primary/60')} />
      <div className="flex items-start justify-between mb-4">
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', colorClass)}>
          <Icon size={18} />
        </div>
        {alert && (
          <span className="text-xs font-semibold text-orange-600 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">
            Alert
          </span>
        )}
      </div>
      <p className="text-2xl font-bold leading-none">{value ?? 0}</p>
      <p className="text-xs text-muted-foreground mt-1.5 font-medium">{label}</p>
      {trend != null && (
        <p className={cn('text-xs mt-2 font-medium', trend >= 0 ? 'text-emerald-600' : 'text-red-500')}>
          {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)} from last week
        </p>
      )}
    </Card>
  )
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, MetricCard }
export default Card
