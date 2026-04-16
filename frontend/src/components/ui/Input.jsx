import * as React from 'react'
import { cn } from '@/lib/utils'

const Input = React.forwardRef(({ className, type, label, error, hint, ...props }, ref) => {
  const input = (
    <input
      type={type}
      className={cn(
        'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        error && 'border-destructive focus-visible:ring-destructive',
        className
      )}
      ref={ref}
      {...props}
    />
  )

  if (!label && !error && !hint) return input

  return (
    <div className="space-y-1.5">
      {label && (
        <label className="text-sm font-medium leading-none text-foreground">
          {label}
          {props.required && <span className="text-destructive ml-0.5">*</span>}
        </label>
      )}
      {input}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
})
Input.displayName = 'Input'

// Native select wrapper
export function Select({ label, error, hint, className, children, ...props }) {
  const select = (
    <select
      className={cn(
        'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        error && 'border-destructive',
        className
      )}
      {...props}
    >
      {children}
    </select>
  )

  if (!label && !error && !hint) return select

  return (
    <div className="space-y-1.5">
      {label && (
        <label className="text-sm font-medium leading-none text-foreground">
          {label}
          {props.required && <span className="text-destructive ml-0.5">*</span>}
        </label>
      )}
      {select}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

export function Textarea({ label, error, hint, className, ...props }) {
  const ta = (
    <textarea
      className={cn(
        'flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-y',
        error && 'border-destructive',
        className
      )}
      {...props}
    />
  )

  if (!label && !error && !hint) return ta

  return (
    <div className="space-y-1.5">
      {label && (
        <label className="text-sm font-medium leading-none text-foreground">
          {label}
          {props.required && <span className="text-destructive ml-0.5">*</span>}
        </label>
      )}
      {ta}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

export { Input }
export default Input
