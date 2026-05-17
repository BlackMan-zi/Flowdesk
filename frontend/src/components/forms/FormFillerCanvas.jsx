import React, { useRef, useEffect, useState, useMemo, useLayoutEffect } from 'react'
import { cn } from '../../lib/utils'
import { Paperclip, Plus, Trash2, X } from 'lucide-react'
import SignaturePad from './SignaturePad'
import { evaluate as evalFormula, tableFormulaContext } from '../../lib/formula'
import { columnLetter, rowFormulaContext, PageBreakChrome } from './FormDesignerCanvas'

// ── Width helpers (12-col grid + free-position) ──────────────────────────────

const WIDTH_TO_SPAN = {
  '1/4': 3, '1/3': 4, '1/2': 6, '2/3': 8, '3/4': 9, 'full': 12,
}
const WIDTH_TO_PCT = {
  '1/4': 25, '1/3': 33.33, '1/2': 50, '2/3': 66.67, '3/4': 75, 'full': 100,
}

const DEFAULT_SECTION = 'General'

// Format a raw numeric string with comma thousand-separators for display.
// Preserves a trailing "." and trailing zeros so users editing decimals don't
// see them silently stripped. Returns the original string for non-numeric
// values so the caller can render them as-is.
function formatNumberWithCommas(raw) {
  if (raw === '' || raw === null || raw === undefined) return ''
  const s = String(raw)
  const isNegative = s.startsWith('-')
  const body = isNegative ? s.slice(1) : s
  if (!/^\d*\.?\d*$/.test(body)) return s
  const [intPart, decPart] = body.split('.')
  const intFmt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const out = decPart !== undefined ? `${intFmt}.${decPart}` : intFmt
  return isNegative ? `-${out}` : out
}

// Strip everything except digits, one leading minus, and one decimal point.
function cleanNumericInput(s) {
  if (s === '' || s === null || s === undefined) return ''
  let v = String(s).replace(/,/g, '')
  // Allow leading minus
  const neg = v.startsWith('-')
  v = v.replace(/-/g, '')
  // Allow only one dot
  const firstDot = v.indexOf('.')
  if (firstDot !== -1) {
    v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, '')
  }
  v = v.replace(/[^\d.]/g, '')
  return neg ? `-${v}` : v
}

function NumberInputWithCommas({ value, onChange, disabled, required, placeholder, className }) {
  const [focused, setFocused] = React.useState(false)
  const display = focused ? (value ?? '') : formatNumberWithCommas(value ?? '')
  return (
    <input
      type="text"
      inputMode="decimal"
      value={display}
      onChange={(e) => onChange(cleanNumericInput(e.target.value))}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      placeholder={placeholder || ''}
      disabled={disabled}
      required={required}
      className={className}
    />
  )
}

const HIERARCHY_LABELS = {
  manager: 'Line Manager', sn_manager: 'Senior Manager', hod: 'Head of Department',
}

// API field → filler "UI type" (mirrors FormDesigner's API_TO_SYSTEM_BLOCK).
const SYSTEM_BLOCK_BY_SOURCE = {
  reference_number:   'reference',
  submission_date:    'submission_date',
  form_classification:'classification',
  approval_block:     'approval_block',
  static_text:        'text_static',
}
function uiType(field) {
  if (field.auto_fill_source && SYSTEM_BLOCK_BY_SOURCE[field.auto_fill_source]) {
    return SYSTEM_BLOCK_BY_SOURCE[field.auto_fill_source]
  }
  return field.field_type
}

// ── Auto-grow textarea (resizes to fit content, no internal scrollbar) ──────
//
// useLayoutEffect runs synchronously after layout so the height stays in
// sync with content as the user types, including pushing later sections /
// pages down to make room. Browser zoom / font size changes also retrigger
// via ResizeObserver on the wrapper. value `||` '' so React stays in
// controlled-input land regardless of null/undefined.

function AutoGrowTextarea({ value, onChange, disabled, required, placeholder, className }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  return (
    <textarea
      ref={ref}
      value={value || ''}
      onChange={onChange}
      disabled={disabled}
      required={required}
      placeholder={placeholder}
      rows={2}
      className={cn(className, 'overflow-hidden resize-none')}
    />
  )
}

// ── Editable table cell ──────────────────────────────────────────────────────

function TableField({ field, value, onChange, accent, disabled }) {
  const cols = field.table_columns?.length
    ? field.table_columns
    : [{ key: 'col1', label: 'Column 1', type: 'text' }]

  // Parse stored JSON; on first edit we ensure at least one row.
  const rows = useMemo(() => {
    if (!value) return [Object.fromEntries(cols.map(c => [c.key, '']))]
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
      return [Object.fromEntries(cols.map(c => [c.key, '']))]
    } catch {
      return [Object.fromEntries(cols.map(c => [c.key, '']))]
    }
  }, [value, cols.length])

  const commit = (next) => onChange(JSON.stringify(next))

  const setCell = (rowIdx, colKey, v) => {
    const next = rows.map((r, i) => i === rowIdx ? { ...r, [colKey]: v } : r)
    commit(next)
  }
  const addRow = () => commit([...rows, Object.fromEntries(cols.map(c => [c.key, '']))])
  const removeRow = (i) => {
    if (rows.length <= 1) return commit([Object.fromEntries(cols.map(c => [c.key, '']))])
    commit(rows.filter((_, idx) => idx !== i))
  }

  // Evaluate per-row formulas to populate computed cells.
  const evaluatedRows = rows.map((row, i) => {
    const out = { ...row }
    for (const c of cols) {
      if (c.formula) {
        const ctx = rowFormulaContext(out, cols, i + 2)
        out[c.key] = evalFormula(c.formula, ctx)
      }
    }
    return out
  })

  // Totals row
  const tableCtx = tableFormulaContext(evaluatedRows, cols)
  const totals = {}
  cols.forEach((c, ci) => {
    if (!c.show_total && !c.total_formula) return
    const formula = c.total_formula || `SUM(${columnLetter(ci)})`
    totals[c.key] = evalFormula(formula, tableCtx)
  })
  const hasTotals = Object.keys(totals).length > 0

  const inputTypeFor = (colType) => {
    if (colType === 'number' || colType === 'currency') return 'number'
    if (colType === 'date') return 'date'
    return 'text'
  }

  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: accent }}>
        {field.field_label}
        {field.required && <span className="text-destructive ml-0.5">*</span>}
      </p>
      <div className="border border-slate-300 rounded overflow-hidden">
        <table className="w-full text-[11px]" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            {cols.map((c, i) => (
              <col key={i} style={c.width ? { width: c.width } : undefined} />
            ))}
            <col style={{ width: '28px' }} />
          </colgroup>
          <thead>
            <tr className="bg-slate-100">
              {cols.map((c, i) => (
                <th key={i} className="text-left px-2 py-1 border-b border-slate-300 font-semibold text-slate-600 truncate">
                  {c.label || `Col ${i + 1}`}
                  {c.formula && <span title={`= ${c.formula}`} className="ml-1 text-primary/60 font-mono text-[10px]">ƒ</span>}
                </th>
              ))}
              <th className="border-b border-slate-300" />
            </tr>
          </thead>
          <tbody>
            {evaluatedRows.map((row, ri) => (
              <tr key={ri} className="group">
                {cols.map((c, ci) => (
                  <td key={ci} className="px-1 py-0.5 border-b border-slate-100 align-top">
                    {c.formula ? (
                      <div className="px-1 py-1 text-slate-500 italic text-[10px]">
                        {typeof row[c.key] === 'string' && row[c.key].startsWith('#ERROR')
                          ? <span className="text-destructive not-italic">{row[c.key]}</span>
                          : String(row[c.key] ?? '—')}
                      </div>
                    ) : disabled ? (
                      <div className="px-1 py-1 text-[11px] text-slate-700 truncate">
                        {row[c.key] || <span className="text-slate-300">—</span>}
                      </div>
                    ) : (
                      <input
                        type={inputTypeFor(c.type)}
                        value={row[c.key] ?? ''}
                        onChange={(e) => setCell(ri, c.key, e.target.value)}
                        className="w-full bg-transparent px-1 py-1 text-[11px] focus:outline-none focus:bg-white focus:ring-1 focus:ring-primary rounded"
                      />
                    )}
                  </td>
                ))}
                <td className="px-1 align-middle text-right">
                  {!disabled && (
                  <button
                    type="button"
                    onClick={() => removeRow(ri)}
                    title="Remove row"
                    className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-destructive transition-opacity"
                  >
                    <X size={11} />
                  </button>
                  )}
                </td>
              </tr>
            ))}
            {hasTotals && (
              <tr className="bg-slate-50 font-semibold">
                {cols.map((c, ci) => (
                  <td key={ci} className="px-2 py-1 text-slate-700 border-t border-slate-300 truncate">
                    {ci === 0 ? 'Total' : ((c.show_total || c.total_formula) ? String(totals[c.key] ?? '') : '')}
                  </td>
                ))}
                <td className="border-t border-slate-300" />
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {!disabled && (
        <button
          type="button"
          onClick={addRow}
          className="mt-1 inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
        >
          <Plus size={10} /> Add row
        </button>
      )}
    </div>
  )
}

// ── Approval rows (resolves real approver names from user/roles/users) ───────

// Render a signature value (type:Name or PNG data URL) inline. Returns
// `null` if no value — caller renders the "not yet signed" dotted line.
function _renderSignatureCell(value) {
  if (!value) return null
  const v = String(value).trim()
  if (v.startsWith('type:')) {
    return <span className="text-[14px]" style={{ fontFamily: "'Brush Script MT', cursive" }}>{v.slice(5)}</span>
  }
  if (v.startsWith('data:image/')) {
    return <img src={v} alt="signature" className="h-5 object-contain" />
  }
  return <span className="text-[10px]">{v}</span>
}

function ApprovalRows({ steps, accent, user, users, roles, initiatorSignatureData, initiatorSignedAt }) {
  const resolveName = (s) => {
    if (s.role_type === 'Hierarchy' || s.source_type === 'hierarchy') {
      const lvl = s.hierarchy_level
      if (lvl === 'manager')    return user?.manager_name || HIERARCHY_LABELS.manager
      if (lvl === 'sn_manager') return user?.sn_manager_name || HIERARCHY_LABELS.sn_manager
      if (lvl === 'hod')        return user?.hod_name || HIERARCHY_LABELS.hod
      return HIERARCHY_LABELS[lvl] || lvl
    }
    if (s.role_type === 'Role' || s.source_type === 'role') {
      return s.role_name || roles?.find(r => r.id === s.role_id)?.name || 'Role-based'
    }
    if (s.role_type === 'Specific' || s.source_type === 'specific_user') {
      return s.specific_user_name || users?.find(u => u.id === s.specific_user_id)?.name || 'Specific user'
    }
    return 'Approver'
  }

  return (
    <table className="w-full text-[10px]">
      <thead>
        <tr className="text-slate-600">
          <th className="text-left py-1 font-semibold w-1/3">Approver</th>
          <th className="text-left py-1 font-semibold">Signature</th>
          <th className="text-left py-1 font-semibold w-24">Date</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td className="py-2 pr-3">
            <div className="font-medium text-slate-700">Requested by</div>
            <div className="text-[9px] text-slate-500">{user?.name || 'You'}</div>
          </td>
          <td className="py-2 pr-3 align-bottom">
            {_renderSignatureCell(initiatorSignatureData) || (
              <div className="border-b border-dashed border-slate-400 h-4" />
            )}
          </td>
          <td className="py-2 align-bottom text-[10px] text-slate-700">
            {initiatorSignedAt
              ? new Date(initiatorSignedAt).toLocaleDateString('en-GB')
              : <div className="border-b border-dashed border-slate-400 h-4" />}
          </td>
        </tr>
        {(steps || []).map((s, idx) => {
          const sigVal = s.signature?.signature_data || s.signature_data
          const signedAt = s.signed_at
          return (
            <tr key={s.id || idx}>
              <td className="py-2 pr-3">
                <div className="font-medium text-slate-700 flex items-center gap-1.5">
                  {s.step_label || resolveName(s)}
                  {s.is_required === false && (
                    <span className="text-[8px] uppercase tracking-wide text-slate-400 font-semibold border border-slate-200 rounded px-1">optional</span>
                  )}
                </div>
                <div className="text-[9px] text-slate-500">{s.approver?.name || resolveName(s)}</div>
              </td>
              <td className="py-2 pr-3 align-bottom">
                {_renderSignatureCell(sigVal) || (
                  <div className="border-b border-dashed border-slate-400 h-4" />
                )}
              </td>
              <td className="py-2 align-bottom text-[10px] text-slate-700">
                {signedAt
                  ? new Date(signedAt).toLocaleDateString('en-GB')
                  : <div className="border-b border-dashed border-slate-400 h-4" />}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ── File chip list ───────────────────────────────────────────────────────────

function FileChips({ files, onRemove, disabled }) {
  if (!files?.length) return null
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {files.map((f, i) => (
        <span key={i} className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 text-[10px] px-2 py-0.5 rounded-full">
          {f.name}
          {!disabled && (
            <button type="button" onClick={() => onRemove(i)} className="hover:text-destructive">
              <X size={10} />
            </button>
          )}
        </span>
      ))}
    </div>
  )
}

// ── Field cell — interactive input(s) per field type ─────────────────────────

function FieldCell({
  field, value, onChange,
  files, onFilesChange,
  user, classification, approvalSteps, users, roles,
  referenceNumber, initiatorSignatureData, initiatorSignedAt,
  formDef, accent, disabled,
}) {
  const t = uiType(field)
  const required = field.required && !disabled

  // ── System blocks (display-only) ──
  if (t === 'text_static') {
    return (
      <div className="text-[11px] text-slate-700 whitespace-pre-wrap leading-snug py-1 px-2">
        {field.default_value || <span className="text-slate-400 italic">[static text]</span>}
      </div>
    )
  }
  if (t === 'reference') {
    return (
      <div className="flex items-baseline gap-2 px-2 py-1">
        <span className="text-[11px] text-slate-600">{field.field_label || 'Reference'}:</span>
        <span className="text-[11px] font-mono text-slate-700">
          {referenceNumber || <span className="text-slate-400 italic">(auto on submit)</span>}
        </span>
      </div>
    )
  }
  if (t === 'submission_date') {
    const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    return (
      <div className="flex items-baseline gap-2 px-2 py-1">
        <span className="text-[11px] text-slate-600">{field.field_label || 'Date'}:</span>
        <span className="text-[11px] text-slate-700">{today}</span>
      </div>
    )
  }
  if (t === 'classification') {
    return (
      <div className="flex items-center justify-center py-1">
        {classification ? (
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
        ) : (
          <span className="text-[10px] text-slate-400 italic">Unclassified</span>
        )}
      </div>
    )
  }
  if (t === 'approval_block') {
    return (
      <div className="px-2 py-1">
        <div className="flex items-center gap-2 mb-2">
          <div className="h-[3px] w-3 rounded-full" style={{ backgroundColor: accent }} />
          <h2 className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: accent }}>
            {field.field_label || 'Approvals'}
          </h2>
          <div className="flex-1 h-px bg-slate-200" />
        </div>
        <ApprovalRows
          steps={approvalSteps}
          accent={accent}
          user={user}
          users={users}
          roles={roles}
          initiatorSignatureData={initiatorSignatureData}
          initiatorSignedAt={initiatorSignedAt}
        />
      </div>
    )
  }

  // ── Auto-filled (current_user.*) — read-only, prefilled ──
  if (field.auto_filled && field.auto_fill_source && !SYSTEM_BLOCK_BY_SOURCE[field.auto_fill_source]) {
    return (
      <div className="px-2 py-1">
        <label className="block text-[10px] text-slate-600 mb-0.5">{field.field_label}</label>
        <div className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-[11px] text-slate-700">
          {value || <span className="text-slate-400 italic">—</span>}
        </div>
      </div>
    )
  }

  // ── Editable inputs ──
  const labelEl = (
    <label className="block text-[10px] text-slate-600 mb-0.5">
      {field.field_label}{required && <span className="text-destructive ml-0.5">*</span>}
    </label>
  )

  const baseInputCls = "w-full border border-slate-300 bg-white rounded px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary disabled:bg-slate-50"

  if (t === 'textarea') {
    return (
      <div className="px-2 py-1">
        {labelEl}
        <AutoGrowTextarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder || ''}
          disabled={disabled}
          required={required}
          className={cn(baseInputCls, 'min-h-[48px]')}
        />
      </div>
    )
  }
  if (t === 'number' || t === 'currency') {
    return (
      <div className="px-2 py-1">
        {labelEl}
        <NumberInputWithCommas
          value={value || ''}
          onChange={onChange}
          placeholder={field.placeholder || ''}
          disabled={disabled}
          required={required}
          className={baseInputCls}
        />
      </div>
    )
  }
  if (t === 'date') {
    return (
      <div className="px-2 py-1">
        {labelEl}
        <input
          type="date"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          required={required}
          className={baseInputCls}
        />
      </div>
    )
  }
  if (t === 'dropdown') {
    return (
      <div className="px-2 py-1">
        {labelEl}
        <select
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          required={required}
          className={baseInputCls}
        >
          <option value="">Select…</option>
          {(field.options || []).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    )
  }
  if (t === 'radio') {
    return (
      <div className="px-2 py-1">
        {labelEl}
        <div className="space-y-1">
          {(field.options || []).map(o => (
            <label key={o} className="flex items-center gap-2 text-[11px] text-slate-700 cursor-pointer">
              <input
                type="radio"
                name={field.id}
                value={o}
                checked={value === o}
                onChange={() => onChange(o)}
                disabled={disabled}
                className="border-slate-300 text-primary focus:ring-primary w-3 h-3"
              />
              {o}
            </label>
          ))}
        </div>
      </div>
    )
  }
  if (t === 'checkbox') {
    const selected = (value || '').split(',').filter(Boolean)
    return (
      <div className="px-2 py-1">
        {labelEl}
        <div className="space-y-1">
          {(field.options || []).map(o => (
            <label key={o} className="flex items-center gap-2 text-[11px] text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.includes(o)}
                onChange={(e) => {
                  const next = new Set(selected)
                  if (e.target.checked) next.add(o)
                  else next.delete(o)
                  onChange(Array.from(next).join(','))
                }}
                disabled={disabled}
                className="rounded border-slate-300 text-primary focus:ring-primary w-3 h-3"
              />
              {o}
            </label>
          ))}
        </div>
      </div>
    )
  }
  if (t === 'calculated') {
    return (
      <div className="px-2 py-1">
        <label className="block text-[10px] text-slate-600 mb-0.5">{field.field_label}</label>
        <div className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-[11px] text-slate-700 font-mono">
          {value !== '' && value != null ? value : <span className="text-slate-400 italic">—</span>}
        </div>
      </div>
    )
  }
  if (t === 'signature') {
    return (
      <div className="px-2 py-1">
        <SignaturePad
          value={value}
          onChange={onChange}
          label={field.field_label}
          required={required}
          disabled={disabled}
        />
      </div>
    )
  }
  if (t === 'file') {
    const list = files?.[field.id] || []
    return (
      <div className="px-2 py-1">
        {labelEl}
        {disabled ? (
          list.length > 0 ? null : (
            <span className="text-[10px] text-slate-400 italic">— attached files listed below the form —</span>
          )
        ) : (
          <label className="inline-flex items-center gap-2 text-[11px] text-primary border border-dashed border-primary/40 rounded px-2 py-1 cursor-pointer hover:bg-primary/5">
            <Paperclip size={12} />
            <span>Attach file{list.length > 0 ? 's' : ''}…</span>
            <input
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                const picked = Array.from(e.target.files || [])
                if (!picked.length) return
                onFilesChange(field.id, [...list, ...picked])
                e.target.value = ''
              }}
            />
          </label>
        )}
        <FileChips
          files={list}
          disabled={disabled}
          onRemove={(i) => onFilesChange(field.id, list.filter((_, idx) => idx !== i))}
        />
      </div>
    )
  }
  if (t === 'table') {
    return <div className="px-2 py-1"><TableField field={field} value={value} onChange={onChange} accent={accent} disabled={disabled} /></div>
  }

  // text fallback
  return (
    <div className="px-2 py-1">
      {labelEl}
      <input
        type="text"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder || ''}
        disabled={disabled}
        required={required}
        className={baseInputCls}
      />
    </div>
  )
}

// ── Section block (layout-aware: grid / row / stack) ─────────────────────────

function SectionBlock({
  section, fields, accent, formDef, classification, approvalSteps, users, roles, user,
  fieldValues, onFieldChange, pendingFiles, onFilesChange, referenceNumber, disabled,
  initiatorSignatureData, initiatorSignedAt,
  layout = 'grid',
}) {
  if (!fields.length) return null

  const containerCls = layout === 'stack' ? 'grid grid-cols-1 gap-y-2'
                     : layout === 'row'   ? 'grid gap-x-3'
                     :                      'grid grid-cols-12 gap-x-3 gap-y-1.5'
  const containerStyle = layout === 'row'
    ? { gridTemplateColumns: `repeat(${fields.length}, minmax(0, 1fr))` }
    : undefined

  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-2">
        <div className="h-[3px] w-3 rounded-full" style={{ backgroundColor: accent }} />
        <h2 className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: accent }}>
          {section}
        </h2>
        <div className="flex-1 h-px bg-slate-200" />
      </div>
      <div className={containerCls} style={containerStyle}>
        {fields.map(f => {
          const isGrid = layout === 'grid'
          const span = WIDTH_TO_SPAN[f.grid_width || 'full']
          const cellStyle = isGrid ? { gridColumn: `span ${span} / span ${span}` } : undefined
          return (
            <div key={f.id} style={cellStyle}>
              <FieldCell
                field={f}
                value={fieldValues[f.id]}
                onChange={(v) => onFieldChange(f.id, v)}
                files={pendingFiles}
                onFilesChange={onFilesChange}
                user={user}
                classification={classification}
                approvalSteps={approvalSteps}
                users={users}
                roles={roles}
                referenceNumber={referenceNumber}
                initiatorSignatureData={initiatorSignatureData}
                initiatorSignedAt={initiatorSignedAt}
                formDef={formDef}
                accent={accent}
                disabled={disabled}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Approval-history table (rendered inline at the bottom of the document) ──

function ApprovalHistorySection({ steps, accent }) {
  if (!steps?.length) return null
  return (
    <div className="mt-5 mb-3">
      <div className="flex items-center gap-2 mb-2">
        <div className="h-[3px] w-3 rounded-full" style={{ backgroundColor: accent }} />
        <h2 className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: accent }}>
          Approval History
        </h2>
        <div className="flex-1 h-px bg-slate-200" />
      </div>
      <table className="w-full text-[10px]">
        <thead className="text-slate-500">
          <tr>
            <th className="text-left font-semibold py-1 pr-2">Step</th>
            <th className="text-left font-semibold py-1 pr-2">Approver</th>
            <th className="text-left font-semibold py-1 pr-2">Status</th>
            <th className="text-left font-semibold py-1 pr-2">Date</th>
            <th className="text-left font-semibold py-1 pr-2">Notes</th>
          </tr>
        </thead>
        <tbody>
          {steps.map(s => (
            <tr key={s.id} className="border-t border-slate-100">
              <td className="py-1 pr-2 text-slate-800">{s.step_label || `Step ${s.step_order}`}</td>
              <td className="py-1 pr-2 text-slate-700">{s.approver?.name || '—'}</td>
              <td className="py-1 pr-2 text-slate-700">{s.status}</td>
              <td className="py-1 pr-2 text-slate-500">
                {s.signed_at ? new Date(s.signed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
              </td>
              <td className="py-1 pr-2 italic text-slate-500">{s.notes || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Inline attachment renderers (image / pdf inline; others listed) ──────────

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|bmp|svg)$/i
const PDF_EXT = /\.pdf$/i
function isImageAttachment(att) {
  return /^image\//.test(att?.content_type || '') || IMAGE_EXT.test(att?.original_filename || '')
}
function isPdfAttachment(att) {
  return (att?.content_type || '') === 'application/pdf' || PDF_EXT.test(att?.original_filename || '')
}

function InlineAttachments({ attachments, attachmentUrls, accent }) {
  if (!attachments?.length) return null
  const inlineable = attachments.filter(a => isImageAttachment(a) || isPdfAttachment(a))
  const listOnly = attachments.filter(a => !isImageAttachment(a) && !isPdfAttachment(a))
  return (
    <>
      {inlineable.map((att, idx) => {
        const url = attachmentUrls?.[att.id]
        return (
          <div key={att.id} className="mt-6 pt-4 border-t-2 border-dashed border-slate-200">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-[3px] w-3 rounded-full" style={{ backgroundColor: accent }} />
              <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: accent }}>
                Attachment {idx + 1} — {att.original_filename}
              </p>
              <div className="flex-1 h-px bg-slate-200" />
            </div>
            {!url ? (
              <div className="text-[10px] text-slate-400 italic text-center py-6">Loading attachment…</div>
            ) : isImageAttachment(att) ? (
              <img src={url} alt={att.original_filename} className="w-full" />
            ) : (
              <embed src={url} type="application/pdf" className="w-full" style={{ height: '760px' }} />
            )}
          </div>
        )
      })}
      {listOnly.length > 0 && (
        <div className="mt-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-[3px] w-3 rounded-full" style={{ backgroundColor: accent }} />
            <h2 className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: accent }}>
              Other Attachments
            </h2>
            <div className="flex-1 h-px bg-slate-200" />
          </div>
          <ul className="space-y-1 text-[11px]">
            {listOnly.map(att => (
              <li key={att.id} className="flex items-baseline gap-2">
                <Paperclip size={11} className="text-slate-400 self-center" />
                <span className="font-medium text-slate-700">{att.original_filename}</span>
                <span className="text-slate-400">{att.content_type || ''}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}

// ── Free-positioned field ────────────────────────────────────────────────────

function FreeField(props) {
  const widthPct = WIDTH_TO_PCT[props.field.grid_width || 'full']
  // y_pct is now interpreted as absolute pixels from the body's top (matches
  // FormDesignerCanvas after the auto-grow fix).
  return (
    <div
      className="absolute"
      style={{
        left: `${props.field.x_pct ?? 0}%`,
        top: `${props.field.y_pct ?? 0}px`,
        width: `${widthPct}%`,
        zIndex: 10,
      }}
    >
      <FieldCell {...props} />
    </div>
  )
}

// ── Main canvas ──────────────────────────────────────────────────────────────

export default function FormFillerCanvas({
  formDef, headerUrl, footerUrl, accent: accentProp, classification,
  user, users, roles, approvalSteps, referenceNumber,
  initiatorSignatureData, initiatorSignedAt,
  fieldValues, onFieldChange,
  pendingFiles, onFilesChange,
  attachments, attachmentUrls,
  disabled,
}) {
  const accent = accentProp || '#0066B3'
  const bodyRef = useRef(null)

  // Memoize derived field lists so they're referentially stable across
  // renders. Without this, useLayoutEffect below sees a new `activeFields`
  // each render and re-runs forever (setBreakAfterIdx({}) returns a new
  // object reference even when the breaks are identical), which makes the
  // canvas paint blank because the render never settles.
  const activeFields = useMemo(
    () => (formDef.fields || []).filter(f => f.is_active !== false),
    [formDef.fields]
  )
  const flowFields = useMemo(() => activeFields.filter(f => !f.free_position), [activeFields])
  const freeFields = useMemo(() => activeFields.filter(f => f.free_position), [activeFields])

  const sectionLayouts = formDef.section_layouts || {}

  // Auto-grow body so the lowest free-positioned field fits with padding.
  const FREE_FIELD_HEIGHT_PADDING = 80
  const minBodyPx = freeFields.length
    ? Math.max(...freeFields.map(f => (f.y_pct ?? 0) + FREE_FIELD_HEIGHT_PADDING))
    : 0

  // Page metrics — walk section bottoms and insert inline page-break chrome
  // between sections that span a page boundary (mirrors FormDesignerCanvas).
  const [pageHeight, setPageHeight] = useState(0)
  const [breakAfterIdx, setBreakAfterIdx] = useState({})
  const [pageCount, setPageCount] = useState(1)
  const sectionRefs = useRef({})

  // Resolve section list while preserving display order.
  const sections = useMemo(() => {
    const seen = new Set()
    const order = []
    for (const f of flowFields) {
      const s = f.section_name || DEFAULT_SECTION
      if (!seen.has(s)) { seen.add(s); order.push(s) }
    }
    return order.length ? order : [DEFAULT_SECTION]
  }, [flowFields])

  useLayoutEffect(() => {
    if (!bodyRef.current) return
    const body = bodyRef.current
    const calc = () => {
      const w = body.clientWidth
      if (!w) return
      const ph = Math.round(w * 1.13)
      const breaks = {}
      let pageNum = 1
      sections.forEach((s, i) => {
        const el = sectionRefs.current[s]
        if (!el) return
        const bottom = el.offsetTop + el.offsetHeight
        if (bottom > pageNum * ph && i < sections.length - 1) {
          breaks[i] = pageNum
          pageNum++
        }
      })
      setPageHeight(ph)
      setPageCount(pageNum)
      // Only update breakAfterIdx if the *content* changed — same content
      // with a fresh reference would re-trigger the effect via deps and we'd
      // loop forever.
      setBreakAfterIdx(prev => {
        const aKeys = Object.keys(prev)
        const bKeys = Object.keys(breaks)
        if (aKeys.length === bKeys.length && bKeys.every(k => prev[k] === breaks[k])) return prev
        return breaks
      })
    }
    calc()
    const ro = new ResizeObserver(calc)
    ro.observe(body)
    return () => ro.disconnect()
  }, [sections, activeFields, sectionLayouts, minBodyPx])

  const bodyMinHeightPx = Math.max(minBodyPx, pageCount * pageHeight)

  return (
    <div
      className="bg-white shadow-lg ring-1 ring-black/5 mx-auto overflow-hidden"
      style={{ width: 'min(720px, 100%)', minHeight: '85vh' }}
    >
      {/* Header band */}
      <div className="flex items-center justify-center px-12 py-4 h-24 border-b border-slate-100">
        {headerUrl
          ? <img src={headerUrl} alt="Header" className="max-h-full max-w-full object-contain" />
          : <div className="text-xs text-slate-400 italic">No header — admin can upload one in Settings.</div>}
      </div>

      {/* Body */}
      <div
        ref={bodyRef}
        className="px-12 py-6 relative"
        style={bodyMinHeightPx > 0 ? { minHeight: `${bodyMinHeightPx}px` } : undefined}
      >
        {/* Free-positioned fields render absolutely */}
        {freeFields.map(f => (
          <FreeField
            key={f.id}
            field={f}
            value={fieldValues[f.id]}
            onChange={(v) => onFieldChange(f.id, v)}
            files={pendingFiles}
            onFilesChange={onFilesChange}
            user={user}
            classification={classification}
            approvalSteps={approvalSteps}
            users={users}
            roles={roles}
            referenceNumber={referenceNumber}
            formDef={formDef}
            accent={accent}
            disabled={disabled}
          />
        ))}

        {/* Title + auto-generated reference number (system-controlled chrome) */}
        <div className="text-center mb-4">
          <h1 className="text-[16px] font-bold tracking-tight" style={{ color: accent }}>
            {formDef.printed_title || formDef.name}
          </h1>
          <div className="mx-auto mt-1 h-[2px] w-16 rounded-full" style={{ backgroundColor: accent }} />
          <div className="text-[10px] font-mono text-slate-500 mt-1.5">
            Ref: {referenceNumber || `FD-${formDef.code_suffix || 'AUTO'}-${new Date().getFullYear()}-####`}
          </div>
        </div>

        {/* Sections */}
        {sections.map((s, idx) => {
          const inSection = flowFields.filter(f => (f.section_name || DEFAULT_SECTION) === s)
          return (
            <React.Fragment key={s}>
              <div ref={(el) => { sectionRefs.current[s] = el }}>
                <SectionBlock
                  section={s}
                  fields={inSection}
                  accent={accent}
                  formDef={formDef}
                  classification={classification}
                  approvalSteps={approvalSteps}
                  users={users}
                  roles={roles}
                  user={user}
                  fieldValues={fieldValues}
                  onFieldChange={onFieldChange}
                  pendingFiles={pendingFiles}
                  onFilesChange={onFilesChange}
                  referenceNumber={referenceNumber}
                  initiatorSignatureData={initiatorSignatureData}
                  initiatorSignedAt={initiatorSignedAt}
                  disabled={disabled}
                  layout={sectionLayouts[s] || 'grid'}
                />
              </div>
              {breakAfterIdx[idx] && (
                <PageBreakChrome
                  fromPage={breakAfterIdx[idx]}
                  totalPages={pageCount}
                  accent={accent}
                  headerUrl={headerUrl}
                  footerUrl={footerUrl}
                />
              )}
            </React.Fragment>
          )
        })}

        {/* Inline attachments — image / PDF render as added pages within
            the document in view / preview mode (disabled). Approval data
            already lives in the placed approval_block field on the form
            schema, so we don't auto-render a second copy here. */}
        {disabled && (
          <InlineAttachments
            attachments={attachments}
            attachmentUrls={attachmentUrls}
            accent={accent}
          />
        )}
      </div>

      {/* Footer band */}
      <div className="flex items-end justify-center px-12 py-2 h-20 border-t border-slate-100">
        {footerUrl
          ? <img src={footerUrl} alt="Footer" className="max-h-full max-w-full object-contain" />
          : <div className="text-xs text-slate-400 italic mb-1">No footer — admin can upload one in Settings.</div>}
      </div>
    </div>
  )
}
