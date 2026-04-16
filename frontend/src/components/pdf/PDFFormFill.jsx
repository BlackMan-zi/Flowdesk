import React, { useState, useRef, useEffect, useMemo } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import PDFPageCanvas from './PDFPageCanvas'
import SignatureCanvas from './SignatureCanvas'
import Modal from '../ui/Modal'
import { getPdfTemplateBlobPage } from '../../api/forms'
import { PenTool, Plus, Trash2 } from 'lucide-react'
import { evaluateFormula, evaluateRowFormula, resolveCalculatedFields } from '../../utils/formulaEngine'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).href

// ── Table grid input ──────────────────────────────────────────────────────────

function TableFieldInput({ field, value, onChange }) {
  const columns = field.table_columns || []
  const rows = useMemo(() => {
    try { return value ? JSON.parse(value) : [{}] }
    catch { return [{}] }
  }, [value])

  const emptyRow = () => Object.fromEntries(columns.map(c => [c.key, '']))

  const updateRow = (ri, colKey, val) => {
    const next = rows.map((r, i) => i === ri ? { ...r, [colKey]: val } : r)
    onChange(JSON.stringify(next))
  }

  const addRow = () => onChange(JSON.stringify([...rows, emptyRow()]))
  const removeRow = (ri) => {
    const next = rows.filter((_, i) => i !== ri)
    onChange(JSON.stringify(next.length ? next : [emptyRow()]))
  }

  return (
    <div className="w-full h-full overflow-auto bg-white/95 border border-blue-400 rounded-sm text-xs">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-slate-100">
            {columns.map(c => (
              <th key={c.key} className="border border-slate-200 px-1.5 py-1 text-left font-semibold text-slate-600 whitespace-nowrap">
                {c.label}
              </th>
            ))}
            <th className="border border-slate-200 w-6" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="even:bg-slate-50">
              {columns.map(c => {
                if (c.type === 'calculated') {
                  const computed = evaluateRowFormula(c.formula, row)
                  return (
                    <td key={c.key} className="border border-slate-200 px-1.5 py-0.5 bg-violet-50 text-violet-700 font-mono">
                      {computed || '—'}
                    </td>
                  )
                }
                return (
                  <td key={c.key} className="border border-slate-200 p-0">
                    <input
                      type={c.type === 'number' || c.type === 'currency' ? 'number' : c.type === 'date' ? 'date' : 'text'}
                      value={row[c.key] || ''}
                      onChange={e => updateRow(ri, c.key, e.target.value)}
                      className="w-full px-1.5 py-0.5 focus:outline-none focus:bg-brand-50"
                    />
                  </td>
                )
              })}
              <td className="border border-slate-200 text-center">
                <button onClick={() => removeRow(ri)} className="text-red-400 hover:text-red-600 px-1">
                  <Trash2 size={10} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        onClick={addRow}
        className="w-full py-1 text-xs text-brand-600 hover:bg-brand-50 flex items-center justify-center gap-1 border-t border-slate-200"
      >
        <Plus size={10} /> Add row
      </button>
    </div>
  )
}

// ── Single field input rendered over the PDF ──────────────────────────────────

function FieldOverlay({ field, value, onChange, allValues, fieldsByName }) {
  const fontSize = field.validation_rules?.font_size || 11
  // Sharp edges, thin border — clean look over PDF backgrounds
  const inputCls = `
    w-full h-full bg-white/90 border border-slate-400/60
    px-1 focus:outline-none focus:ring-1 focus:ring-brand-400 focus:bg-white focus:border-brand-400
  `
  const inputStyle = { fontSize: `${fontSize}px`, borderRadius: 0 }

  if (field.field_type === 'signature') {
    return (
      <button
        type="button"
        onClick={onChange}
        className="w-full h-full rounded-sm border-2 border-dashed border-red-400 bg-white/80 hover:bg-white flex items-center justify-center gap-1 transition-colors"
      >
        {value ? (
          <img src={value} alt="Signature" className="max-w-full max-h-full object-contain" />
        ) : (
          <span className="flex items-center gap-1 text-xs text-red-500 font-medium">
            <PenTool size={11} /> Sign here
          </span>
        )}
      </button>
    )
  }

  if (field.field_type === 'textarea') {
    return (
      <textarea
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        placeholder={field.placeholder || field.field_label}
        className={inputCls + ' resize-none'}
        style={inputStyle}
        readOnly={field.read_only}
        required={field.required}
      />
    )
  }

  if (field.field_type === 'dropdown') {
    return (
      <select
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        style={inputStyle}
        className={inputCls}
        disabled={field.read_only}
        required={field.required}
      >
        <option value="">Select…</option>
        {(field.options || []).map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    )
  }

  if (field.field_type === 'radio') {
    return (
      <div className="w-full h-full overflow-auto bg-white/80 border border-slate-400/60 p-1 space-y-0.5">
        {(field.options || []).map(o => (
          <label key={o} className="flex items-center gap-1 text-xs cursor-pointer">
            <input
              type="radio"
              name={field.id}
              value={o}
              checked={value === o}
              onChange={() => onChange(o)}
              disabled={field.read_only}
            />
            {o}
          </label>
        ))}
      </div>
    )
  }

  if (field.field_type === 'checkbox') {
    const selected = (value || '').split(',').filter(Boolean)
    return (
      <div className="w-full h-full overflow-auto bg-white/80 border border-slate-400/60 p-1 space-y-0.5">
        {(field.options || []).map(o => (
          <label key={o} className="flex items-center gap-1 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={selected.includes(o)}
              disabled={field.read_only}
              onChange={e => {
                const next = e.target.checked
                  ? [...selected, o]
                  : selected.filter(x => x !== o)
                onChange(next.join(','))
              }}
              className="rounded"
            />
            {o}
          </label>
        ))}
      </div>
    )
  }

  if (field.field_type === 'currency') {
    return (
      <div className="w-full h-full flex items-center bg-white/90 border border-slate-400/60 overflow-hidden">
        <span className="px-1 text-xs text-slate-500 font-medium bg-slate-50 border-r border-slate-300 h-full flex items-center">$</span>
        <input
          type="number"
          step="0.01"
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          placeholder="0.00"
          readOnly={field.read_only}
          required={field.required}
          className="flex-1 h-full text-xs px-1 focus:outline-none focus:ring-1 focus:ring-emerald-400 bg-transparent"
        />
      </div>
    )
  }

  if (field.field_type === 'calculated') {
    const computed = evaluateFormula(field.calculation_formula, allValues, fieldsByName)
    return (
      <div className="w-full h-full bg-violet-50 border border-violet-200 flex items-center px-1.5 text-xs text-violet-800 font-mono">
        {computed || <span className="text-slate-400 italic">Auto-calculated</span>}
      </div>
    )
  }

  if (field.field_type === 'table') {
    return <TableFieldInput field={field} value={value} onChange={onChange} />
  }

  const inputType = field.field_type === 'number' ? 'number'
                  : field.field_type === 'date'   ? 'date'
                  : 'text'

  return (
    <input
      type={inputType}
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      placeholder={field.placeholder || field.field_label}
      readOnly={field.read_only}
      required={field.required}
      className={inputCls}
      style={inputStyle}
    />
  )
}

// ── Single page view ─────────────────────────────────────────────────────────

/**
 * Renders one form page: the PDF background (if any) with field overlays on top.
 * pdfDoc     - the pdfjsLib document for this form page (may differ per page)
 * pdfPageNum - which page within that pdfDoc to render (usually 1 for per-page templates)
 * formPage   - the form page number (for filtering fields)
 */
function PageFillView({ pdfDoc, pdfPageNum, formPage, fields, values, onValueChange, onSignatureClick, fieldsByName }) {
  const containerRef = useRef(null)
  const [containerWidth, setContainerWidth] = useState(0)

  useEffect(() => {
    if (!containerRef.current) return
    const obs = new ResizeObserver(entries => setContainerWidth(entries[0].contentRect.width))
    obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [])

  const pageFields = fields.filter(f => (f.page_number || 1) === formPage)

  return (
    <div ref={containerRef} style={{ position: 'relative' }} className="shadow-md bg-white">
      {containerWidth > 0 && pdfDoc && (
        <PDFPageCanvas pdfDoc={pdfDoc} pageNum={pdfPageNum} containerWidth={containerWidth} />
      )}
      {/* Blank white area when no PDF for this page */}
      {containerWidth > 0 && !pdfDoc && (
        <div style={{ width: '100%', height: Math.round(containerWidth * 1.414), backgroundColor: 'white' }} />
      )}

      {/* Field overlays */}
      {pageFields.map(field => (
        <div
          key={field.id}
          style={{
            position: 'absolute',
            left: `${field.x_pct}%`,
            top: `${field.y_pct}%`,
            width: `${field.width_pct}%`,
            height: `${field.height_pct}%`,
          }}
        >
          <FieldOverlay
            field={field}
            value={values[field.id]}
            allValues={values}
            fieldsByName={fieldsByName}
            onChange={
              field.field_type === 'signature'
                ? () => onSignatureClick(field.id)
                : (val) => onValueChange(field.id, val)
            }
          />
          {/* Required asterisk badge */}
          {field.required && !values[field.id] && (
            <span style={{ position: 'absolute', top: -6, right: -4, fontSize: 10, lineHeight: 1 }}
              className="text-red-500 font-bold pointer-events-none select-none">*</span>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Main PDFFormFill component ────────────────────────────────────────────────

/**
 * Renders all form pages as a continuous vertical scroll.
 * Each page may have its own PDF template (uploaded via per-page upload).
 * Falls back to rendering the correct page from the main multi-page PDF.
 *
 * Props:
 *   formDef     - form definition object (has .id, .fields, .pdf_template_path)
 *   values      - { [fieldId]: value } controlled from parent
 *   onChange    - (fieldId, value) => void
 *   currentUser - for auto-fill fields
 */
export default function PDFFormFill({ formDef, values, onChange, currentUser }) {
  // pageTemplates maps form-page-number → { doc, pageCount }
  const [pageTemplates, setPageTemplates] = useState({})
  const [sigFieldId, setSigFieldId] = useState(null)

  // Load all per-page templates on mount
  useEffect(() => {
    if (!formDef?.id) return
    const blobUrls = []

    const allFields = formDef.fields || []
    const maxFormPage = allFields.length
      ? Math.max(...allFields.map(f => f.page_number || 1))
      : 1

    async function loadPage(pageNum) {
      try {
        const res = await getPdfTemplateBlobPage(formDef.id, pageNum)
        const blobUrl = URL.createObjectURL(res.data)
        blobUrls.push(blobUrl)
        const doc = await pdfjsLib.getDocument(blobUrl).promise
        setPageTemplates(prev => ({ ...prev, [pageNum]: { doc, pageCount: doc.numPages } }))
      } catch {
        // No template for this page — blank canvas will be used
      }
    }

    // Load page 1 (main template) + any per-page templates up to the max form page
    for (let p = 1; p <= Math.max(maxFormPage, 1); p++) {
      loadPage(p)
    }

    return () => blobUrls.forEach(u => URL.revokeObjectURL(u))
  }, [formDef?.id])

  // Auto-fill fields on mount
  useEffect(() => {
    if (!formDef?.fields) return
    formDef.fields.filter(f => f.auto_filled).forEach(f => {
      if (f.auto_fill_source === 'current_user.name' && currentUser?.name) {
        onChange(f.id, currentUser.name)
      }
    })
  }, [formDef?.id])

  // Build field_name → field map for formula resolution
  const fieldsByName = useMemo(() => {
    const map = {}
    ;(formDef?.fields || []).forEach(f => { map[f.field_name] = f })
    return map
  }, [formDef?.fields])

  // Resolve all calculated fields in dependency order.
  // This produces a values map that includes computed results for every
  // calculated field, so aggregate formulas like cal1+cal2+…+cal8 work.
  const resolvedValues = useMemo(
    () => resolveCalculatedFields(formDef?.fields, values, fieldsByName),
    [formDef?.fields, values, fieldsByName]
  )

  const positionedFields = (formDef?.fields || []).filter(
    f => f.is_active !== false && f.x_pct != null
  )

  // Fields without position fall back to a list below the PDF pages
  const unpositionedFields = (formDef?.fields || []).filter(
    f => f.is_active !== false && f.x_pct == null
  )

  // Determine total form pages: max page_number across all positioned fields,
  // or page count of page-1 PDF if it's a multi-page file
  const mainPageCount = pageTemplates[1]?.pageCount || 0
  const maxFieldPage  = positionedFields.length
    ? Math.max(...positionedFields.map(f => f.page_number || 1))
    : 0
  const totalPages = Math.max(mainPageCount, maxFieldPage, 1)

  // Loading: show spinner until we've attempted page 1 (either got it or confirmed missing)
  const isLoading = Object.keys(pageTemplates).length === 0 && formDef?.pdf_template_path

  if (isLoading) {
    return (
      <div className="flex justify-center py-12 text-slate-400 text-sm">
        Loading form…
      </div>
    )
  }

  return (
    <>
      <div className="space-y-3">
        {Array.from({ length: totalPages }, (_, i) => i + 1).map(formPage => {
          // Resolve which pdfDoc and page-within-doc to use for this form page
          const hasOwn = !!pageTemplates[formPage]
          const pdfDoc     = hasOwn ? pageTemplates[formPage].doc : pageTemplates[1]?.doc || null
          const pdfPageNum = hasOwn ? 1 : formPage

          // Skip rendering the PDF canvas if formPage exceeds what the main doc has
          const mainDocPages = pageTemplates[1]?.pageCount || 0
          const showPdf = hasOwn || formPage <= mainDocPages

          return (
            <PageFillView
              key={formPage}
              pdfDoc={showPdf ? pdfDoc : null}
              pdfPageNum={pdfPageNum}
              formPage={formPage}
              fields={positionedFields}
              values={resolvedValues}
              onValueChange={onChange}
              onSignatureClick={setSigFieldId}
              fieldsByName={fieldsByName}
            />
          )
        })}

        {/* Fallback list for any unpositioned fields */}
        {unpositionedFields.length > 0 && (
          <div className="space-y-3 pt-2">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Additional Fields</p>
            {unpositionedFields.map(field => (
              <div key={field.id}>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {field.field_label}{field.required ? ' *' : ''}
                </label>
                {field.field_type === 'textarea' ? (
                  <textarea
                    value={values[field.id] || ''}
                    onChange={e => onChange(field.id, e.target.value)}
                    rows={3}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                ) : field.field_type === 'signature' ? (
                  <button
                    type="button"
                    onClick={() => setSigFieldId(field.id)}
                    className="w-full border-2 border-dashed border-slate-300 rounded-xl p-4 hover:border-brand-400 transition-colors flex items-center justify-center gap-2 text-sm text-slate-500"
                  >
                    {values[field.id]
                      ? <img src={values[field.id]} alt="Signature" className="h-12 object-contain" />
                      : <><PenTool size={16} /> Click to sign</>
                    }
                  </button>
                ) : (
                  <input
                    type={field.field_type === 'number' ? 'number' : field.field_type === 'date' ? 'date' : 'text'}
                    value={values[field.id] || ''}
                    onChange={e => onChange(field.id, e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Signature modal */}
      <Modal
        open={!!sigFieldId}
        onClose={() => setSigFieldId(null)}
        title="Add Your Signature"
        size="md"
      >
        <SignatureCanvas
          onCapture={(dataUrl) => {
            onChange(sigFieldId, dataUrl)
            setSigFieldId(null)
          }}
          onCancel={() => setSigFieldId(null)}
        />
      </Modal>
    </>
  )
}
