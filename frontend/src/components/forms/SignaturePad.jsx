import React, { useRef, useEffect, useState } from 'react'
import { PenLine, Type as TypeIcon, RotateCcw } from 'lucide-react'
import { cn } from '../../lib/utils'

// Signature value encoding:
//   - Empty:      null / ''
//   - Type mode:  "type:<name>"
//   - Draw mode:  data:image/png;base64,...
//
// The view side renders type values as a script-font line and draw values as
// an <img>. Backend stores the string verbatim in FormFieldValue.value.

const SIGNATURE_FONT = "'Brush Script MT', 'Lucida Handwriting', cursive"

function parseValue(value) {
  if (!value) return { mode: 'type', typeName: '', drawDataUrl: null }
  if (value.startsWith('type:')) return { mode: 'type', typeName: value.slice(5), drawDataUrl: null }
  if (value.startsWith('data:image/')) return { mode: 'draw', typeName: '', drawDataUrl: value }
  return { mode: 'type', typeName: value, drawDataUrl: null }
}

export default function SignaturePad({ value, onChange, label, required, disabled }) {
  const parsed = parseValue(value)
  const [mode, setMode] = useState(parsed.mode)
  const [typeName, setTypeName] = useState(parsed.typeName)
  const canvasRef = useRef(null)
  const drawingRef = useRef(false)
  const lastPtRef = useRef(null)

  // ── Type mode ──
  const commitType = (name) => {
    setTypeName(name)
    onChange(name ? `type:${name}` : '')
  }

  // ── Draw mode ──
  const getCanvasPoint = (e) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    }
  }
  const startDraw = (e) => {
    if (disabled) return
    e.preventDefault()
    drawingRef.current = true
    lastPtRef.current = getCanvasPoint(e)
  }
  const moveDraw = (e) => {
    if (!drawingRef.current || disabled) return
    e.preventDefault()
    const pt = getCanvasPoint(e)
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx || !pt || !lastPtRef.current) return
    ctx.strokeStyle = '#0f172a'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(lastPtRef.current.x, lastPtRef.current.y)
    ctx.lineTo(pt.x, pt.y)
    ctx.stroke()
    lastPtRef.current = pt
  }
  const endDraw = () => {
    if (!drawingRef.current) return
    drawingRef.current = false
    lastPtRef.current = null
    const canvas = canvasRef.current
    if (canvas) onChange(canvas.toDataURL('image/png'))
  }

  // Restore prior draw value into the canvas when entering Draw mode.
  useEffect(() => {
    if (mode !== 'draw') return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (parsed.drawDataUrl) {
      const img = new Image()
      img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      img.src = parsed.drawDataUrl
    }
  }, [mode])

  const clearAll = () => {
    if (mode === 'draw') {
      const canvas = canvasRef.current
      if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
    } else {
      setTypeName('')
    }
    onChange('')
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-medium text-slate-700">
          {label}{required && <span className="text-destructive ml-0.5">*</span>}
        </label>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setMode('type')}
            className={cn(
              'flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border transition-colors',
              mode === 'type'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-slate-200 text-slate-500 hover:bg-slate-50'
            )}
          >
            <TypeIcon size={10} /> Type
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setMode('draw')}
            className={cn(
              'flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border transition-colors',
              mode === 'draw'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-slate-200 text-slate-500 hover:bg-slate-50'
            )}
          >
            <PenLine size={10} /> Draw
          </button>
          {(typeName || parsed.drawDataUrl) && (
            <button
              type="button"
              disabled={disabled}
              onClick={clearAll}
              className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-slate-200 text-slate-500 hover:bg-destructive/10 hover:text-destructive"
              title="Clear signature"
            >
              <RotateCcw size={10} />
            </button>
          )}
        </div>
      </div>

      {mode === 'type' ? (
        <>
          <input
            type="text"
            value={typeName}
            onChange={(e) => commitType(e.target.value)}
            placeholder="Type your name"
            disabled={disabled}
            className="w-full border border-slate-200 bg-white rounded px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary disabled:bg-slate-50"
          />
          {typeName && (
            <div
              className="text-[20px] text-slate-800 leading-tight pt-1 px-2 border-b border-slate-300"
              style={{ fontFamily: SIGNATURE_FONT }}
            >
              {typeName}
            </div>
          )}
        </>
      ) : (
        <div className="border border-dashed border-slate-300 rounded bg-white">
          <canvas
            ref={canvasRef}
            width={400}
            height={80}
            onPointerDown={startDraw}
            onPointerMove={moveDraw}
            onPointerUp={endDraw}
            onPointerLeave={endDraw}
            className="w-full h-[80px] touch-none cursor-crosshair"
          />
        </div>
      )}
    </div>
  )
}
