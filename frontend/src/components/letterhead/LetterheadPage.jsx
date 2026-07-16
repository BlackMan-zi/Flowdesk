import React from 'react'
import { cn } from '../../lib/utils'

/**
 * One A4 page wrapped in the organisation's letterhead.
 *
 * Used by:
 *   - Settings → Letterhead Preview (this round)
 *   - Phase D form filler (so users see what gets exported)
 *   - Phase E HTML→PDF render (same DOM, just printed)
 *
 * Layout (fractions of page height):
 *   - top 12%: header image strip (object-fit: contain, centered)
 *   - 12 → 88%: body region (children, with horizontal padding ~8%)
 *   - bottom 12%: footer image strip
 *
 * The classification chip pins to the top-right of the body region above
 * any title supplied by the caller.
 */
export default function LetterheadPage({
  headerImageUrl,
  footerImageUrl,
  accentColor,
  classification,        // { name, color } | null
  className,
  bodyClassName,
  children,
}) {
  const accent = accentColor || '#0066B3'

  return (
    <div
      className={cn(
        'relative bg-white text-slate-900 shadow-lg ring-1 ring-black/5 overflow-hidden mx-auto',
        className
      )}
      style={{ aspectRatio: '210 / 297' }}
    >
      {/* Header band */}
      <div
        className="absolute inset-x-0 top-0 flex items-center justify-center px-[6%]"
        style={{ height: '12%' }}
      >
        {headerImageUrl ? (
          <img
            src={headerImageUrl}
            alt="Organization header"
            className="max-h-full max-w-full object-contain"
            draggable={false}
          />
        ) : (
          <div className="text-xs text-slate-400 italic">
            No header uploaded. Set one in Settings.
          </div>
        )}
      </div>

      {/* Footer band */}
      <div
        className="absolute inset-x-0 bottom-0 flex items-end justify-center px-[6%] pb-[1%]"
        style={{ height: '12%' }}
      >
        {footerImageUrl ? (
          <img
            src={footerImageUrl}
            alt="Organization footer"
            className="max-h-full max-w-full object-contain"
            draggable={false}
          />
        ) : (
          <div className="text-xs text-slate-400 italic">
            No footer uploaded. Set one in Settings.
          </div>
        )}
      </div>

      {/* Body */}
      <div
        className={cn('absolute inset-x-0 px-[8%]', bodyClassName)}
        style={{ top: '13%', bottom: '13%' }}
      >
        {classification && (
          <div className="flex justify-end mb-2">
            <span
              className="inline-block text-[9px] font-semibold uppercase tracking-[0.12em] px-2 py-0.5 rounded border"
              style={{
                color: classification.color || '#64748B',
                borderColor: `${classification.color || '#64748B'}80`,
                backgroundColor: `${classification.color || '#64748B'}15`,
              }}
            >
              {classification.name}
            </span>
          </div>
        )}

        {/* Accent rule under the title: callers can opt out by passing
            a child <div data-accent-rule="false"> if they prefer. */}
        <div className="relative h-full overflow-hidden" style={{ '--accent': accent }}>
          {children}
        </div>
      </div>
    </div>
  )
}
