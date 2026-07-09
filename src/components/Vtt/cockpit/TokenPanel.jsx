import { useState, useEffect, useCallback } from 'react'

/* ── Token list + property editor panel (DM) ───────────────── */
export default function TokenPanel({ canvas, eventBus, scene, isDm, session }) {
  const [tokens, setTokens] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [actors, setActors] = useState([])

  useEffect(() => {
    if (!scene) return
    function refresh() { setTokens([...scene.tokens]) }
    refresh()
    const offs = [
      eventBus?.on('token:created', refresh),
      eventBus?.on('token:updated', refresh),
      eventBus?.on('token:deleted', refresh),
    ]
    return () => { offs.forEach(o => o?.()) }
  }, [scene, eventBus])

  useEffect(() => {
    function refresh() {
      if (canvas?.controller?.actorMap) setActors(Array.from(canvas.controller.actorMap.values()))
    }
    refresh()
    const offs = [eventBus?.on('actors-changed', refresh)]
    return () => { offs.forEach(o => o?.()) }
  }, [canvas, eventBus])

  const sel = selectedId ? tokens.find(t => t.id === selectedId) : null

  const handleDelete = useCallback((id) => {
    if (!canvas || !eventBus || !scene) return
    const token = scene.getToken(id)
    if (token) {
      canvas.removeToken(id)
      scene.removeToken(id)
    }
    eventBus.emitRecord('token', 'deleted', { id })
    if (selectedId === id) setSelectedId(null)
  }, [canvas, eventBus, scene, selectedId])

  const handleSave = useCallback((changes) => {
    if (!sel || !canvas || !eventBus || !scene) return
    scene.updateToken(sel.id, changes)
    canvas.renderer.loadScene(scene)
    eventBus.emitRecord('token', 'updated', { id: sel.id, sceneId: sel.sceneId, ...changes })
    canvas.refreshLighting()
  }, [sel, canvas, eventBus, scene])

  return (
    <div className="vtt-panel vtt-token-panel">
      <h4>Tokens ({tokens.length})</h4>
      <div className="vtt-token-list">
        {tokens.map(t => (
          <div
            key={t.id}
            className={`vtt-token-item ${t.id === selectedId ? 'selected' : ''}`}
            onClick={() => setSelectedId(t.id)}
          >
            <span className="vtt-token-name">{t.name}</span>
            <span className="vtt-token-pos">({Math.round(t.x)}, {Math.round(t.y)})</span>
            {isDm && (
              <button onClick={(e) => { e.stopPropagation(); handleDelete(t.id) }} className="btn btn-sm vtt-disconnect-btn" title="Delete token">✕</button>
            )}
          </div>
        ))}
      </div>

      {sel && (
        <div className="vtt-token-props">
          <hr className="vtt-divider" />
          <h4>Properties — {sel.name}</h4>
          <TokenPropEditor token={sel} onSave={handleSave} actors={actors} canvas={canvas} />
        </div>
      )}
    </div>
  )
}

function TokenPropEditor({ token, onSave, actors, canvas }) {
  const [name, setName] = useState(token.name)
  const [w, setW] = useState(token.width)
  const [h, setH] = useState(token.height)
  const [src, setSrc] = useState(token.src ?? '')
  const [actorId, setActorId] = useState(token.actorId ?? '')
  const [visionEnabled, setVisionEnabled] = useState(token.visionEnabled)
  const [darkvisionRange, setDarkvisionRange] = useState(token.darkvisionRange)
  const [lightRadius, setLightRadius] = useState(token.lightRadius)
  const [lightColor, setLightColor] = useState('#' + (token.lightColor ?? 0xffeedd).toString(16).padStart(6, '0'))
  const [lightIntensity, setLightIntensity] = useState(token.lightIntensity ?? 1)
  const [maxHp, setMaxHp] = useState(token.maxHp ?? '')
  const [speed, setSpeed] = useState(token.speed ?? 30)

  useEffect(() => {
    setName(token.name)
    setW(token.width)
    setH(token.height)
    setSrc(token.src ?? '')
    setActorId(token.actorId ?? '')
    setVisionEnabled(token.visionEnabled)
    setDarkvisionRange(token.darkvisionRange)
    setLightRadius(token.lightRadius)
    setLightColor('#' + (token.lightColor ?? 0xffeedd).toString(16).padStart(6, '0'))
    setLightIntensity(token.lightIntensity ?? 1)
    setMaxHp(token.maxHp ?? '')
    setSpeed(token.speed ?? 30)
  }, [token])

  const handleSubmit = useCallback((e) => {
    e.preventDefault()
    onSave({
      maxHp: maxHp === '' ? null : Number(maxHp),
      /* Raising max HP heals to full only when HP was never set. */
      ...(maxHp !== '' && (token.hp == null) ? { hp: Number(maxHp) } : {}),
      speed: Number(speed) || 30,
      name,
      width: w,
      height: h,
      src,
      actorId: actorId || null,
      visionEnabled,
      darkvisionRange,
      lightRadius,
      lightColor: parseInt(lightColor.replace('#', ''), 16),
      lightIntensity,
    })
  }, [onSave, name, w, h, src, actorId, visionEnabled, darkvisionRange, lightRadius, lightColor, lightIntensity])

  return (
    <form onSubmit={handleSubmit} className="vtt-token-prop-form">
      <label>Name
        <input value={name} onChange={e => setName(e.target.value)} className="vtt-input" />
      </label>
      <label>Width
        <input type="number" value={w} onChange={e => setW(Number(e.target.value))} className="vtt-input" min={20} />
      </label>
      <label>Height
        <input type="number" value={h} onChange={e => setH(Number(e.target.value))} className="vtt-input" min={20} />
      </label>
      <label>Image URL
        <input value={src} onChange={e => setSrc(e.target.value)} className="vtt-input" placeholder="https://..." />
      </label>

      {actors && actors.length > 0 && (
        <label>Linked Actor
          <select value={actorId} onChange={e => setActorId(e.target.value)} className="vtt-input">
            <option value="">— None (standalone) —</option>
            {actors.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </label>
      )}

      <hr className="vtt-divider" />
      <h4>Tactical</h4>
      <label>Max HP
        <input type="number" value={maxHp} onChange={e => setMaxHp(e.target.value)} className="vtt-input" min={0} placeholder="none" />
      </label>
      <label>Speed ({canvas?.scene?.gridUnitLabel || 'ft'})
        <input type="number" value={speed} onChange={e => setSpeed(Number(e.target.value))} className="vtt-input" min={0} step={5} />
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

      <div className="vtt-modal-actions" style={{ marginTop: 8 }}>
        <button type="submit" className="btn vtt-connect-btn">Save</button>
      </div>
    </form>
  )
}
