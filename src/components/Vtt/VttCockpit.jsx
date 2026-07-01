import { useState, useRef, useCallback, useEffect } from 'react'
import { uploadImage } from '../../data/api.js'

const TOOLS = { PAN: 'pan', TOKEN: 'token', WALL_DRAW: 'wall-draw', WALL_SELECT: 'wall-select', RULER: 'ruler', TEMPLATE: 'template' }

/* ── Tool button ───────────────────────────────────────────── */
function ToolBtn({ label, tool, activeTool, dmOnly, isDm, onSelect }) {
  if (dmOnly && !isDm) return null
  return (
    <button
      className={`vtt-tool-btn ${activeTool === tool ? 'active' : ''}`}
      onClick={() => onSelect(tool)}
      title={label}
    >
      {label}
    </button>
  )
}

/* ── Add Token modal ───────────────────────────────────────── */
function AddTokenModal({ canvas, eventBus, onClose, userId }) {
  const [name, setName] = useState('New Token')
  const [w, setW] = useState(100)
  const [h, setH] = useState(100)
  const [src, setSrc] = useState('')
  const [visionEnabled, setVisionEnabled] = useState(false)
  const [sightRange, setSightRange] = useState(300)
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
      sightRange,
      darkvisionRange,
      lightRadius,
      lightColor: parseInt(lightColor.replace('#', ''), 16),
      lightIntensity,
    })
    eventBus.emitRecord('token', 'created', token.toJSON())
    onClose()
  }, [canvas, eventBus, name, w, h, src, onClose, userId, visionEnabled, sightRange, darkvisionRange, lightRadius, lightColor, lightIntensity])

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
          <>
            <label>Sight Range (world units)
              <input type="number" value={sightRange} onChange={e => setSightRange(Number(e.target.value))} className="vtt-input" min={0} />
            </label>
            <label>Darkvision Range
              <input type="number" value={darkvisionRange} onChange={e => setDarkvisionRange(Number(e.target.value))} className="vtt-input" min={0} />
            </label>
          </>
        )}
        <label>Light Radius
          <input type="number" value={lightRadius} onChange={e => setLightRadius(Number(e.target.value))} className="vtt-input" min={0} />
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

/* ── Token list + property editor panel (DM) ───────────────── */
function TokenPanel({ canvas, eventBus, scene, isDm }) {
  const [tokens, setTokens] = useState([])
  const [selectedId, setSelectedId] = useState(null)

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
    eventBus.emitRecord('token', 'updated', { id: sel.id, ...changes })
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
          <TokenPropEditor token={sel} onSave={handleSave} />
        </div>
      )}
    </div>
  )
}

function TokenPropEditor({ token, onSave }) {
  const [name, setName] = useState(token.name)
  const [w, setW] = useState(token.width)
  const [h, setH] = useState(token.height)
  const [src, setSrc] = useState(token.src ?? '')
  const [visionEnabled, setVisionEnabled] = useState(token.visionEnabled)
  const [sightRange, setSightRange] = useState(token.sightRange)
  const [darkvisionRange, setDarkvisionRange] = useState(token.darkvisionRange)
  const [lightRadius, setLightRadius] = useState(token.lightRadius)
  const [lightColor, setLightColor] = useState('#' + (token.lightColor ?? 0xffeedd).toString(16).padStart(6, '0'))
  const [lightIntensity, setLightIntensity] = useState(token.lightIntensity ?? 1)

  useEffect(() => {
    setName(token.name)
    setW(token.width)
    setH(token.height)
    setSrc(token.src ?? '')
    setVisionEnabled(token.visionEnabled)
    setSightRange(token.sightRange)
    setDarkvisionRange(token.darkvisionRange)
    setLightRadius(token.lightRadius)
    setLightColor('#' + (token.lightColor ?? 0xffeedd).toString(16).padStart(6, '0'))
    setLightIntensity(token.lightIntensity ?? 1)
  }, [token])

  const handleSubmit = useCallback((e) => {
    e.preventDefault()
    onSave({
      name,
      width: w,
      height: h,
      src,
      visionEnabled,
      sightRange,
      darkvisionRange,
      lightRadius,
      lightColor: parseInt(lightColor.replace('#', ''), 16),
      lightIntensity,
    })
  }, [onSave, name, w, h, src, visionEnabled, sightRange, darkvisionRange, lightRadius, lightColor, lightIntensity])

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

      <hr className="vtt-divider" />
      <h4>Vision & Lighting</h4>
      <label className="vtt-toggle">
        <input type="checkbox" checked={visionEnabled} onChange={e => setVisionEnabled(e.target.checked)} />
        Enable Vision
      </label>
      {visionEnabled && (
        <>
          <label>Sight Range
            <input type="number" value={sightRange} onChange={e => setSightRange(Number(e.target.value))} className="vtt-input" min={0} />
          </label>
          <label>Darkvision Range
            <input type="number" value={darkvisionRange} onChange={e => setDarkvisionRange(Number(e.target.value))} className="vtt-input" min={0} />
          </label>
        </>
      )}
      <label>Light Radius
        <input type="number" value={lightRadius} onChange={e => setLightRadius(Number(e.target.value))} className="vtt-input" min={0} />
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

/* ── Background image upload panel (DM) ────────────────────── */
function BackgroundPanel({ canvas, eventBus, scene }) {
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)

  const handleUpload = useCallback(async () => {
    const file = fileRef.current?.files?.[0]
    if (!file || !canvas || !eventBus || !scene) return
    setUploading(true)
    try {
      const result = await uploadImage(file, 'vtt')
      if (result.ok) {
        const imgUrl = result.url
        const oldBg = scene.tiles.find(t => t.isBackground)
        if (oldBg) {
          scene.removeTile(oldBg.id)
          eventBus.emitRecord('tile', 'deleted', { id: oldBg.id })
        }
        const { Tile } = await import('../../vtt/canvas/Tile.js')
        const tile = new Tile({
          src: imgUrl,
          x: 0, y: 0,
          width: scene.width,
          height: scene.height,
          zIndex: -1,
          isBackground: true,
          id: 'scene-bg-' + Date.now(),
        })
        scene.addTile(tile)
        canvas.renderer.loadScene(scene)
        eventBus.emitRecord('tile', 'created', tile.toJSON())
      }
    } catch (e) {
      console.error('Background upload failed', e)
    }
    setUploading(false)
  }, [canvas, eventBus, scene])

  return (
    <div className="vtt-panel vtt-bg-panel">
      <h4>Background Map</h4>
      <input type="file" ref={fileRef} accept="image/*" className="vtt-file-input" />
      <button onClick={handleUpload} disabled={uploading} className="btn btn-sm vtt-connect-btn">
        {uploading ? 'Uploading...' : 'Set as Background'}
      </button>
    </div>
  )
}

/* ── Lighting / Vision panel (DM) ──────────────────────────── */
function LightingPanel({ canvas, isDm, eventBus }) {
  if (!isDm || !canvas) return null
  const [lighting, setLighting] = useState(false)
  const [fog, setFog] = useState(false)
  const [viewAll, setViewAll] = useState(false)
  const [ambient, setAmbient] = useState(0)
  const [viewpointId, setViewpointId] = useState(canvas.controller?._viewpointTokenIds?.[0] ?? '')
  const [tokens, setTokens] = useState(canvas.scene ? [...canvas.scene.tokens] : [])
  const [gridUnit, setGridUnit] = useState(canvas.scene?.gridUnit ?? 5)
  const [gridUnitLabel, setGridUnitLabel] = useState(canvas.scene?.gridUnitLabel ?? 'ft')

  /* Sync token list with scene changes */
  useEffect(() => {
    if (!canvas?.scene) return
    function refresh() { setTokens([...canvas.scene.tokens]) }
    refresh()
    const unsubs = []
    if (eventBus) {
      unsubs.push(eventBus.on('token:created', refresh))
      unsubs.push(eventBus.on('token:updated', refresh))
      unsubs.push(eventBus.on('token:deleted', refresh))
    }
    return () => { unsubs.forEach(u => u?.()) }
  }, [canvas, eventBus])

  const handleToggleLighting = useCallback(() => {
    const next = !lighting
    setLighting(next)
    canvas.setLightingEnabled(next)
    if (next) canvas.refreshLighting()
  }, [canvas, lighting])

  const handleToggleFog = useCallback(() => {
    const next = !fog
    setFog(next)
    canvas.setFogEnabled(next)
    if (next) canvas.refreshLighting()
  }, [canvas, fog])

  const handleToggleViewAll = useCallback(() => {
    const next = !viewAll
    setViewAll(next)
    canvas.controller.viewAll = next
    canvas.refreshLighting()
  }, [canvas, viewAll])

  const handleResetFog = useCallback(() => {
    canvas.resetFog()
  }, [canvas])

  const handleSetAmbient = useCallback((e) => {
    const val = Number(e.target.value)
    setAmbient(val)
    canvas.scene.ambientLight = val
    canvas.controller.ambientLight = val
    canvas.refreshLighting()
  }, [canvas])

  const handleViewpointSelect = useCallback((e) => {
    const id = e.target.value
    setViewpointId(id)
    if (id) {
      canvas.setViewpoint(id)
    } else {
      canvas.controller.setViewpoint([])
      canvas.refreshLighting()
    }
  }, [canvas])

  const handleGridUnitChange = useCallback((e) => {
    const val = Number(e.target.value)
    setGridUnit(val)
    if (canvas?.scene) {
      canvas.scene.gridUnit = val
      canvas.renderer.rulerLayer.setGrid(canvas.scene.gridSize, canvas.scene.gridType, val, canvas.scene.gridUnitLabel)
    }
  }, [canvas])

  const handleGridUnitLabelChange = useCallback((e) => {
    const val = e.target.value
    setGridUnitLabel(val)
    if (canvas?.scene) {
      canvas.scene.gridUnitLabel = val
      canvas.renderer.rulerLayer.setGrid(canvas.scene.gridSize, canvas.scene.gridType, canvas.scene.gridUnit, val)
    }
  }, [canvas])

  return (
    <div className="vtt-panel vtt-lighting-panel">
      <h4>Lighting & Vision</h4>
      <label className="vtt-toggle">
        <input type="checkbox" checked={lighting} onChange={handleToggleLighting} />
        Dynamic Lighting
      </label>
      <label className="vtt-toggle">
        <input type="checkbox" checked={fog} onChange={handleToggleFog} />
        Fog of War
      </label>
      <label className="vtt-toggle">
        <input type="checkbox" checked={viewAll} onChange={handleToggleViewAll} />
        GM View All
      </label>
      <button onClick={handleResetFog} className="btn btn-sm" style={{marginTop:4}}>Reset Fog</button>
      <label>Ambient Light (0-1)
        <input type="range" min="0" max="1" step="0.05" value={ambient} onChange={handleSetAmbient} className="vtt-range" />
      </label>

      <hr className="vtt-divider" />

      <h4>Grid & Ruler</h4>
      <label>Unit per grid cell
        <input type="number" min="0.1" step="1" value={gridUnit} onChange={handleGridUnitChange} className="vtt-input" />
      </label>
      <label>Unit label
        <input type="text" value={gridUnitLabel} onChange={handleGridUnitLabelChange} className="vtt-input" placeholder="e.g. ft, m" />
      </label>

      <hr className="vtt-divider" />

      <h4>Viewpoint</h4>
      <p className="vtt-hint">Choose which token the scene is viewed from. Dynamic lighting uses this token's position and vision range.</p>
      <label>
        <select value={viewpointId} onChange={handleViewpointSelect} className="vtt-input">
          <option value="">— None (no viewpoint) —</option>
          {tokens.map(t => (
            <option key={t.id} value={t.id}>
              {t.name}{t.userId ? '' : ''}
            </option>
          ))}
        </select>
      </label>
      {viewpointId && (
        <p className="vtt-viewpoint-info">Viewing from a token with <strong>Dynamic Lighting</strong> enabled</p>
      )}
    </div>
  )
}

/* ── Presence display ─────────────────────────────────────── */
function PresenceBar({ connectedUsers, session }) {
  return (
    <div className="vtt-presence-bar">
      <span className="vtt-presence-dot" />
      <span>Connected</span>
      {connectedUsers.map((u, i) => (
        <span key={u.userId ?? i} className="vtt-presence-user">
          {u.username ?? u.userId}
          {u.role === 'dm' ? ' ⚔️' : ' 🎭'}
        </span>
      ))}
    </div>
  )
}

/* ── Main cockpit ──────────────────────────────────────────── */
export default function VttCockpit({ canvas, eventBus, scene, isDm, session, connectedUsers, onDisconnect }) {
  const [activeTool, setActiveTool] = useState('pan')
  const [showAddToken, setShowAddToken] = useState(false)
  const [showTokenPanel, setShowTokenPanel] = useState(false)
  const [showBgPanel, setShowBgPanel] = useState(false)
  const [showLighting, setShowLighting] = useState(false)

  /* Sync active tool to canvas controller once canvas is available */
  useEffect(() => {
    if (canvas?.controller) {
      canvas.setTool(activeTool)
    }
  }, [canvas, activeTool])

  const handleToolSelect = useCallback((tool) => {
    setActiveTool(prev => prev === tool && tool === 'token' ? 'pan' : tool)
  }, [])

  return (
    <>
      <div className="vtt-cockpit-toolbar">
        <div className="vtt-tool-group">
          <ToolBtn label="✋ Pan" tool="pan" activeTool={activeTool} isDm={isDm} onSelect={handleToolSelect} />
          <ToolBtn label="◎ Token" tool="token" activeTool={activeTool} isDm={isDm} onSelect={handleToolSelect} />
          <ToolBtn label="▬ Wall" tool="wall-draw" activeTool={activeTool} dmOnly isDm={isDm} onSelect={handleToolSelect} />
          <ToolBtn label="↗ Wall Sel" tool="wall-select" activeTool={activeTool} dmOnly isDm={isDm} onSelect={handleToolSelect} />
          <ToolBtn label="📏 Ruler" tool="ruler" activeTool={activeTool} isDm={isDm} onSelect={handleToolSelect} />
          <ToolBtn label="⬠ Template" tool="template" activeTool={activeTool} dmOnly isDm={isDm} onSelect={handleToolSelect} />
        </div>

        <PresenceBar connectedUsers={connectedUsers} session={session} />

        <div className="vtt-tool-group">
          {isDm && (
            <>
              <button onClick={() => setShowAddToken(true)} className="btn btn-sm vtt-action-btn" disabled={!canvas}>
                + Token
              </button>
              <button onClick={() => setShowTokenPanel(p => !p)} className={`btn btn-sm vtt-action-btn ${showTokenPanel ? 'active' : ''}`}>
                Tokens
              </button>
              <button onClick={() => setShowBgPanel(p => !p)} className={`btn btn-sm vtt-action-btn ${showBgPanel ? 'active' : ''}`}>
                Map BG
              </button>
              <button onClick={() => setShowLighting(p => !p)} className={`btn btn-sm vtt-action-btn ${showLighting ? 'active' : ''}`}>
                Light
              </button>
            </>
          )}
          <button onClick={onDisconnect} className="btn btn-sm vtt-disconnect-btn">DC</button>
          <a href="/" className="btn btn-sm vtt-leave-btn">Leave</a>
        </div>
      </div>

      <div className="vtt-panels-container">
        {showTokenPanel && (
          <TokenPanel canvas={canvas} eventBus={eventBus} scene={scene} isDm={isDm} />
        )}
        {showBgPanel && (
          <BackgroundPanel canvas={canvas} eventBus={eventBus} scene={scene} />
        )}
        {showLighting && (
          <LightingPanel canvas={canvas} isDm={isDm} eventBus={eventBus} />
        )}
      </div>

      {showAddToken && (
        <AddTokenModal canvas={canvas} eventBus={eventBus} onClose={() => setShowAddToken(false)} userId={session?.userId} />
      )}
    </>
  )
}
