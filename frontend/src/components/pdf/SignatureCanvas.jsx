import React, { useRef, useState } from 'react'
import SignaturePad from 'react-signature-canvas'
import Button from '../ui/Button'
import { Pen, Type, RotateCcw, Check } from 'lucide-react'

/**
 * Signature capture — draw or type.
 * Calls onCapture(dataURL) when the user confirms, or onCapture(null) if cleared.
 */
export default function SignatureCanvas({ onCapture, onCancel }) {
  const padRef = useRef(null)
  const [mode, setMode] = useState('draw') // 'draw' | 'type'
  const [typedName, setTypedName] = useState('')
  const [preview, setPreview] = useState(null)

  const clear = () => {
    padRef.current?.clear()
    setTypedName('')
    setPreview(null)
  }

  const buildTypedDataURL = (name) => {
    const canvas = document.createElement('canvas')
    canvas.width = 400
    canvas.height = 120
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.font = '52px "Dancing Script", Georgia, cursive'
    ctx.fillStyle = '#1e293b'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(name, 200, 60)
    return canvas.toDataURL('image/png')
  }

  const confirm = () => {
    if (mode === 'draw') {
      if (!padRef.current || padRef.current.isEmpty()) return
      onCapture(padRef.current.toDataURL('image/png'))
    } else {
      if (!typedName.trim()) return
      onCapture(buildTypedDataURL(typedName.trim()))
    }
  }

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setMode('draw')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            mode === 'draw' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Pen size={13} /> Draw
        </button>
        <button
          onClick={() => setMode('type')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            mode === 'type' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Type size={13} /> Type
        </button>
      </div>

      {mode === 'draw' ? (
        <div className="border-2 border-dashed border-slate-300 rounded-xl bg-white overflow-hidden">
          <SignaturePad
            ref={padRef}
            canvasProps={{ width: 520, height: 160, className: 'block' }}
            backgroundColor="white"
            penColor="#1e293b"
          />
          <p className="text-xs text-slate-400 text-center pb-2 -mt-1">Draw your signature above</p>
        </div>
      ) : (
        <div className="space-y-2">
          <input
            type="text"
            value={typedName}
            onChange={e => setTypedName(e.target.value)}
            placeholder="Type your full name…"
            className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            style={{ fontFamily: '"Dancing Script", Georgia, cursive' }}
          />
          {typedName && (
            <div className="border border-slate-200 rounded-xl bg-white flex items-center justify-center py-6">
              <span className="text-3xl text-slate-800" style={{ fontFamily: '"Dancing Script", Georgia, cursive' }}>
                {typedName}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Button onClick={confirm} disabled={mode === 'draw' ? false : !typedName.trim()}>
          <Check size={14} className="mr-1.5" /> Use Signature
        </Button>
        <Button variant="secondary" onClick={clear}>
          <RotateCcw size={14} className="mr-1.5" /> Clear
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        )}
      </div>
    </div>
  )
}
