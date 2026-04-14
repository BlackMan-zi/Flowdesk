import { useEffect, useRef } from 'react'
import * as pdfjsLib from 'pdfjs-dist'

// Use the bundled worker via Vite's URL resolution
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).href

/**
 * Renders a single PDF page onto a <canvas> element.
 *
 * Props:
 *   pdfDoc        - loaded pdfjsLib document object
 *   pageNum       - 1-based page number to render
 *   containerWidth - pixel width to render at (height scales proportionally)
 *   onRendered    - callback({ width, height }) called after render
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

      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)

      await page.render({ canvasContext: ctx, viewport }).promise
      if (!cancelled && onRendered) {
        onRendered({ width: canvas.width, height: canvas.height })
      }
    }

    render().catch(console.error)
    return () => { cancelled = true }
  }, [pdfDoc, pageNum, containerWidth])

  return <canvas ref={canvasRef} className="block w-full" />
}
