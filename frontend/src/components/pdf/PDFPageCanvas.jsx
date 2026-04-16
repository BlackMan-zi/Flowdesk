import { useEffect, useRef } from 'react'
import * as pdfjsLib from 'pdfjs-dist'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).href

/**
 * Renders a single PDF page onto a <canvas> element.
 * Supports HiDPI / Retina via devicePixelRatio so edge content is never clipped.
 *
 * Props:
 *   pdfDoc        - loaded pdfjsLib document object
 *   pageNum       - 1-based page number to render
 *   containerWidth - pixel width to render at (height scales proportionally)
 *   onRendered    - callback({ width, height }) called after render (CSS px, not device px)
 */
export default function PDFPageCanvas({ pdfDoc, pageNum, containerWidth, onRendered }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current || !containerWidth) return
    let cancelled = false

    async function render() {
      const page = await pdfDoc.getPage(pageNum)
      if (cancelled) return

      const baseViewport = page.getViewport({ scale: 1 })
      const scale = containerWidth / baseViewport.width
      const viewport = page.getViewport({ scale })
      const dpr = window.devicePixelRatio || 1

      // CSS size in logical pixels (matches containerWidth exactly)
      const cssW = Math.ceil(viewport.width)
      const cssH = Math.ceil(viewport.height)

      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')

      // Physical pixel size = CSS size × DPR for sharp HiDPI rendering
      canvas.width  = cssW * dpr
      canvas.height = cssH * dpr
      canvas.style.width  = cssW + 'px'
      canvas.style.height = cssH + 'px'

      // Fill white background so edge content on transparent PDFs is visible
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Scale context to match device pixel ratio
      ctx.scale(dpr, dpr)

      await page.render({ canvasContext: ctx, viewport }).promise
      if (!cancelled && onRendered) {
        onRendered({ width: cssW, height: cssH })
      }
    }

    render().catch(console.error)
    return () => { cancelled = true }
  }, [pdfDoc, pageNum, containerWidth])

  return <canvas ref={canvasRef} style={{ display: 'block' }} />
}
