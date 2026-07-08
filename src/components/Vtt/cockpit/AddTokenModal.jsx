import { useState, useCallback } from 'react'

/* ── Add Token modal ───────────────────────────────────────── */
export default function AddTokenModal({ canvas, eventBus, onClose, userId }) {
  const [name, setName] = useState('New Token')
  const [w, setW] = useState(100)
  const [h, setH] = useState(100)
  const [src, setSrc] = useState('')
  const [visionEnabled, setVisionEnabled] = useState(false)
  const [darkvisionRange, setDarkvisionRange] = useState(60)
  const [lightRadius, setLightRadius] = useState(0)
  const [lightColor, setLightColor] = useState('#ffeedd')
  const [lightIntensity, setLightIntensity] = useState(1)

  const handleAdd = useCallback(() => {
    if (!canvas || !eventBus) return
    const renderer = canvas.renderer
    const cx = renderer.app.renderer.width / 2
    const cy = renderer.app.renderer.height / 2
    const center = renderer.screenToWorld(cx, cy)
    const token = canvas.addToken({
      name,
      x: center.x - w / 2,
      y: center.y - h / 2,
      width: w,
      height: h,
      src,
      userId,
      visionEnabled,
      darkvisionRange,
      lightRadius,
      lightColor: parseInt(lightColor.replace('#', ''), 16),
      lightIntensity,
    })
    eventBus.emitRecord('token', 'created', token.toJSON())
    onClose()
  }, [canvas, eventBus, name, w, h, src, onClose, userId, visionEnabled, darkvisionRange, lightRadius, lightColor, lightIntensity])

  return (
    <div className="vtt-modal-overlay" onClick={onClose}>
      <div className="vtt-modal" onClick={e => e.stopPropagation()}>
        <h3>Add Token</h3>
        <label>Name
          <input value={name} onChange={e => setName(e.target.value)} className="vtt-input" />
        </label>
        <label>Width
          <input type="number" value={w} onChange={e => setW(Number(e.target.value))} className="vtt-input" min={20} />
        </label>
        <label>Height
          <input type="number" value={h} onChange={e => setH(Number(e.target.value))} className="vtt-input" min={20} />
        </label>
        <label>Image URL (optional)
          <input value={src} onChange={e => setSrc(e.target.value)} className="vtt-input" placeholder="https://..." />
        </label>

        <hr className="vtt-divider" />
        <h4>Vision & Lighting</h4>
        <label className="vtt-toggle">
          <input type="checkbox" checked={visionEnabled} onChange={e => setVisionEnabled(e.target.checked)} />
          Enable Vision
        </label>
        {visionEnabled && (
          <label>Darkvision Range
            <input type="number" value={darkvisionRange} onChange={e => setDarkvisionRange(Number(e.target.value))} className="vtt-input" min={0} />
            <span className="vtt-unit-hint">{canvas?.scene?.gridSize ? `${Math.round(darkvisionRange / canvas.scene.gridSize)} sq` : ''}</span>
          </label>
        )}
        <label>Light Radius
          <input type="number" value={lightRadius} onChange={e => setLightRadius(Number(e.target.value))} className="vtt-input" min={0} />
          <span className="vtt-unit-hint">{canvas?.scene?.gridSize ? `${Math.round(lightRadius / canvas.scene.gridSize)} sq` : ''}</span>
        </label>
        {lightRadius > 0 && (
          <>
            <label>Light Color
              <input type="color" value={lightColor} onChange={e => setLightColor(e.target.value)} className="vtt-input" />
            </label>
            <label>Light Intensity
              <input type="range" min="0" max="1" step="0.1" value={lightIntensity} onChange={e => setLightIntensity(Number(e.target.value))} className="vtt-range" />
            </label>
          </>
        )}

        <div className="vtt-modal-actions">
          <button onClick={handleAdd} className="btn vtt-connect-btn">Add</button>
          <button onClick={onClose} className="btn btn-sm">Cancel</button>
        </div>
      </div>
    </div>
  )
}
