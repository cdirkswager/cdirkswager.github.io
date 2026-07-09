import { useEffect, useRef, useState } from 'react'

export default function VttCanvasMount({ eventBus, world, onReady }) {
  const mountRef = useRef(null)
  const canvasRef = useRef(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let destroyed = false

    async function init() {
      if (!mountRef.current || !eventBus) return

      try {
        const { createVttCanvas } = await import('../../vtt/canvas/main.js')
        const canvas = await createVttCanvas(mountRef.current, {
          eventBus,
          /* Server-authoritative: the world was hydrated from the server
             snapshot BEFORE this mount. The canvas invents nothing. */
          world,
        })

        if (destroyed) {
          canvas.destroy()
          return
        }

        canvasRef.current = canvas

        if (onReady) {
          onReady(canvas)
        }

        // Force resize after mount — flex layout may not have settled when init() ran,
        // so the ResizeObserver might fire with stale/near-zero dimensions.
        requestAnimationFrame(() => {
          if (!destroyed && canvasRef.current?.renderer) {
            canvasRef.current.renderer.resize()
          }
        })
      } catch (e) {
        if (!destroyed) {
          setError(e.message || 'Failed to initialize canvas')
        }
      }
    }

    init()

    return () => {
      destroyed = true
      if (canvasRef.current) {
        canvasRef.current.destroy()
        canvasRef.current = null
      }
    }
  }, [eventBus, world, onReady])

  if (error) {
    return (
      <div className="vtt-error">
        <p>Canvas error: {error}</p>
        <button onClick={() => setError(null)}>Retry</button>
      </div>
    )
  }

  return (
    <div
      ref={mountRef}
      className="vtt-canvas-mount"
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
      }}
    />
  )
}
