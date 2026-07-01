import { useEffect, useRef, useState } from 'react'

export default function VttCanvasMount({ eventBus, onReady }) {
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
          sceneName: 'Campaign Map',
          width: 4000,
          height: 3000,
          gridType: 'square',
          gridSize: 100,
          backgroundColor: '#2a2a2a',
          eventBus,
        })

        if (destroyed) {
          canvas.destroy()
          return
        }

        canvasRef.current = canvas

        if (onReady) {
          onReady(canvas)
        }
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
  }, [eventBus, onReady])

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
