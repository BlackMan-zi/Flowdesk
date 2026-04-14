import React from 'react'

const styles = {
  Draft:                  'bg-slate-100 text-slate-700',
  Submitted:              'bg-blue-100 text-blue-700',
  Pending:                'bg-amber-100 text-amber-700',
  'Returned for Correction': 'bg-orange-100 text-orange-700',
  Rejected:               'bg-red-100 text-red-700',
  Approved:               'bg-green-100 text-green-700',
  Completed:              'bg-emerald-100 text-emerald-700',
  Active:                 'bg-blue-100 text-blue-700',
  Waiting:                'bg-slate-100 text-slate-600',
  Skipped:                'bg-slate-100 text-slate-400',
  'Sent Back':            'bg-orange-100 text-orange-700',
  default:                'bg-slate-100 text-slate-600',
}

export default function Badge({ label, className = '' }) {
  const style = styles[label] || styles.default
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${style} ${className}`}>
      {label}
    </span>
  )
}
