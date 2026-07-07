import { useState, useRef, useEffect, useCallback } from 'react'

function Minimap({ canvas, scene }) {
  const ref = useRef(null)
  const dragging = useRef(false)
  const MAP_W = 200
  const MAP_H = 150

  useEffect(() => {
    if (!ref.current || !scene) return
    const ctx = ref.current.getContext('2d')
    let frame
    function draw() {
      if (!ctx || !scene) return
      const sw = scene.width || 4000
      const sh = scene.height || 3000
      const sx = MAP_W / sw
      const sy = MAP_H / sh

      ctx.fillStyle = '#1a1612'
      ctx.fillRect(0, 0, MAP_W, MAP_H)

      ctx.strokeStyle = '#3a2f1e'
      ctx.lineWidth = 0.5
      ctx.strokeRect(0, 0, MAP_W, MAP_H)

      const tokens = scene.tokens || []
      for (const t of tokens) {
        const tx = t.x * sx
        const ty = t.y * sy
        ctx.fillStyle = t.locked ? '#8a7440' : '#c9a84c'
        ctx.beginPath()
        ctx.arc(tx, ty, Math.max(3, Math.min(t.width, t.height) * sx * 0.5), 0, Math.PI * 2)
        ctx.fill()
      }

      if (canvas?.renderer) {
        const r = canvas.renderer
        const cw = r.app?.renderer?.width || 800
        const ch = r.app?.renderer?.height || 600
        const tl = r.screenToWorld(0, 0)
        const br = r.screenToWorld(cw, ch)
        const vx = tl.x * sx
        const vy = tl.y * sy
        const vw = (br.x - tl.x) * sx
        const vh = (br.y - tl.y) * sy
        ctx.strokeStyle = 'rgba(255,255,255,0.6)'
        ctx.lineWidth = 1.5
        ctx.strokeRect(vx, vy, vw, vh)
      }

      frame = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(frame)
  }, [canvas, scene])

  const handlePointerDown = useCallback((e) => {
    dragging.current = true
    handlePan(e)
  }, [])

  const handlePointerMove = useCallback((e) => {
    if (!dragging.current) return
    handlePan(e)
  }, [])

  const handlePointerUp = useCallback(() => {
    dragging.current = false
  }, [])

  function handlePan(e) {
    if (!canvas?.renderer || !scene) return
    const rect = ref.current.getBoundingClientRect()
    const px = (e.clientX - rect.left) / MAP_W
    const py = (e.clientY - rect.top) / MAP_H
    const sw = scene.width || 4000
    const sh = scene.height || 3000
    const wx = px * sw
    const wy = py * sh
    const r = canvas.renderer
    const cw = r.app?.renderer?.width || 800
    const ch = r.app?.renderer?.height || 600
    const cx = cw / 2
    const cy = ch / 2
    const center = r.screenToWorld(cx, cy)
    const dx = wx - center.x
    const dy = wy - center.y
    r.sceneContainer.x -= dx * r.sceneContainer.scale.x
    r.sceneContainer.y -= dy * r.sceneContainer.scale.y
  }

  return (
    <canvas
      ref={ref}
      className="vtt-minimap"
      width={MAP_W}
      height={MAP_H}
      onMouseDown={handlePointerDown}
      onMouseMove={handlePointerMove}
      onMouseUp={handlePointerUp}
      onMouseLeave={handlePointerUp}
    />
  )
}

function ActorPreview({ canvas, eventBus }) {
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    if (!canvas?.controller || !eventBus) return
    const ctrl = canvas.controller
    const orig = ctrl.onTokenClicked
    ctrl.onTokenClicked = (tokenData) => {
      if (tokenData?.actorId) {
        const actor = ctrl.actorMap?.get(tokenData.actorId)
        setSelected(actor || null)
      } else {
        setSelected(null)
      }
      orig?.(tokenData)
    }
    return () => { if (canvas?.controller) canvas.controller.onTokenClicked = ctrl.onTokenClicked }
  }, [canvas, eventBus])

  if (!selected) return null
  const hp = selected.attributes?.hp
  const hpPct = hp ? Math.max(0, Math.min(100, (hp.current / (hp.max || 1)) * 100)) : 100
  return (
    <div className="vtt-actor-preview">
      <div className="vtt-ap-name">{selected.name}</div>
      {hp && (
        <div className="vtt-ap-hp">
          <div className="vtt-ap-hpbar"><i style={{ width: `${hpPct}%` }} /></div>
          <span>{hp.current}/{hp.max}</span>
        </div>
      )}
    </div>
  )
}

export default function VttHud({ canvas, eventBus, scene, isDm, win, onOpenScreen }) {
  return (
    <div className="vtt-hud">
      <div className="vtt-hud-section">
        <Minimap canvas={canvas} scene={scene} />
      </div>

      <div className="vtt-hud-section vtt-hud-actions">
        <button className="vtt-hud-btn" onClick={() => onOpenScreen?.('inventory')} title="Inventory (I)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>
        </button>
        <button className="vtt-hud-btn" onClick={() => onOpenScreen?.('loot')} title="Loot (L)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>
        </button>
        <button className="vtt-hud-btn" onClick={() => onOpenScreen?.('party')} title="Party (P)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
        </button>
      </div>

      <div className="vtt-hud-section vtt-hud-actor">
        <ActorPreview canvas={canvas} eventBus={eventBus} />
      </div>

      <div className="vtt-hud-section vtt-hud-endturn">
        <button className="vtt-hud-endturn-btn" disabled title="End Turn — coming soon">
          END TURN
        </button>
      </div>
    </div>
  )
}
