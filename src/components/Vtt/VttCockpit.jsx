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
function AddTokenModal({ canvas, eventBus, onClose }) {
  const [name, setName] = useState('New Token')
  const [w, setW] = useState(100)
  const [h, setH] = useState(100)
  const [src, setSrc] = useState('')

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
    })
    eventBus.emitRecord('token', 'created', token.toJSON())
    onClose()
  }, [canvas, eventBus, name, w, h, src, onClose])

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
        <div className="vtt-modal-actions">
          <button onClick={handleAdd} className="btn vtt-connect-btn">Add</button>
          <button onClick={onClose} className="btn btn-sm">Cancel</button>
        </div>
      </div>
    </div>
  )
}

/* ── Token list panel (DM) ─────────────────────────────────── */
function TokenListPanel({ canvas, eventBus, scene, isDm }) {
  const [tokens, setTokens] = useState([])

  useEffect(() => {
    if (!scene) return
    function refresh() { setTokens([...scene.tokens]) }
    refresh()
    const off1 = eventBus?.on('token:created', refresh)
    const off2 = eventBus?.on('token:updated', refresh)
    const off3 = eventBus?.on('token:deleted', refresh)
    return () => { off1?.(); off2?.(); off3?.() }
  }, [scene, eventBus])

  const handleDelete = useCallback((id) => {
    if (!canvas || !eventBus || !scene) return
    const token = scene.getToken(id)
    if (token) {
      canvas.removeToken(id)
      scene.removeToken(id)
    }
    eventBus.emitRecord('token', 'deleted', { id })
  }, [canvas, eventBus, scene])

  return (
    <div className="vtt-panel vtt-token-panel">
      <h4>Tokens ({tokens.length})</h4>
      <div className="vtt-token-list">
        {tokens.map(t => (
          <div key={t.id} className="vtt-token-item">
            <span className="vtt-token-name">{t.name}</span>
            <span className="vtt-token-pos">({Math.round(t.x)}, {Math.round(t.y)})</span>
            {isDm && (
              <button onClick={() => handleDelete(t.id)} className="btn btn-sm vtt-disconnect-btn" title="Delete token">✕</button>
            )}
          </div>
        ))}
      </div>
    </div>
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
function LightingPanel({ canvas, isDm }) {
  if (!isDm || !canvas) return null
  const [lighting, setLighting] = useState(false)
  const [fog, setFog] = useState(false)
  const [viewAll, setViewAll] = useState(false)
  const [ambient, setAmbient] = useState(0)
  const [viewpointId, setViewpointId] = useState('')

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

  const handleSetViewpoint = useCallback(() => {
    if (viewpointId.trim()) {
      canvas.setViewpoint(viewpointId.trim())
    } else {
      canvas.controller.setViewpoint([])
      canvas.refreshLighting()
    }
  }, [canvas, viewpointId])

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
      <label>Viewpoint Token ID
        <input value={viewpointId} onChange={e => setViewpointId(e.target.value)} className="vtt-input" placeholder="Paste token ID" />
      </label>
      <button onClick={handleSetViewpoint} className="btn btn-sm">Set Viewpoint</button>
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
          <TokenListPanel canvas={canvas} eventBus={eventBus} scene={scene} isDm={isDm} />
        )}
        {showBgPanel && (
          <BackgroundPanel canvas={canvas} eventBus={eventBus} scene={scene} />
        )}
        {showLighting && (
          <LightingPanel canvas={canvas} isDm={isDm} />
        )}
      </div>

      {showAddToken && (
        <AddTokenModal canvas={canvas} eventBus={eventBus} onClose={() => setShowAddToken(false)} />
      )}
    </>
  )
}
