import { useState, useRef, useCallback, useEffect } from 'react'
import { uploadImage } from '../../data/api.js'
import { Actor } from '../../vtt/canvas/Actor.js'
import { Item } from '../../vtt/canvas/Item.js'
import { getAccessLevel, hasAccess, OWNERSHIP_LEVELS } from '../../vtt/canvas/ownership.js'
import InventoryScreen from './inventory/InventoryScreen.jsx'
import LootPanel from './inventory/LootPanel.jsx'
import PartyPanel from './inventory/PartyPanel.jsx'
import { useWindowStack, useVttHotkeys } from './inventory/windowStack.js'
import VttTopBar from './VttTopBar.jsx'
import VttHud from './VttHud.jsx'
import VttScenePanel from './VttScenePanel.jsx'
import './vtt-theme.css'

const TOOLS = { PAN: 'pan', TOKEN: 'token', WALL_DRAW: 'wall-draw', WALL_SELECT: 'wall-select', RULER: 'ruler', TEMPLATE: 'template' }

/* ── Add Token modal ───────────────────────────────────────── */
function AddTokenModal({ canvas, eventBus, onClose, userId }) {
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

/* ── Token list + property editor panel (DM) ───────────────── */
function TokenPanel({ canvas, eventBus, scene, isDm, session }) {
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
  }, [token])

  const handleSubmit = useCallback((e) => {
    e.preventDefault()
    onSave({
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
  const [lighting, setLighting] = useState(canvas.scene?.lightingEnabled ?? false)
  const [ambient, setAmbient] = useState(canvas.scene?.ambientLight ?? 0)
  const [gridUnit, setGridUnit] = useState(canvas.scene?.gridUnit ?? 5)
  const [gridUnitLabel, setGridUnitLabel] = useState(canvas.scene?.gridUnitLabel ?? 'ft')
  const [viewAll, setViewAll] = useState(canvas.controller?.viewAll ?? false)
  const [viewpointId, setViewpointId] = useState(canvas.controller?._viewpointTokenIds?.[0] ?? '')
  const [tokens, setTokens] = useState(canvas.scene ? [...canvas.scene.tokens] : [])

  /* Sync token list when tokens change */
  useEffect(() => {
    if (!eventBus || !canvas?.scene) return
    const sync = () => setTokens([...canvas.scene.tokens])
    sync()
    const unsub1 = eventBus.on('token:created', sync)
    const unsub2 = eventBus.on('token:updated', sync)
    const unsub3 = eventBus.on('token:deleted', sync)
    return () => { unsub1(); unsub2(); unsub3() }
  }, [eventBus, canvas])

  /* Sync state from scene record changes (e.g. init replay) */
  useEffect(() => {
    if (!eventBus || !canvas?.scene) return
    const refresh = () => {
      setLighting(canvas.scene.lightingEnabled)
      setAmbient(canvas.scene.ambientLight ?? 0)
    }
    const unsub1 = eventBus.on('scene:updated', refresh)
    const unsub2 = eventBus.on('scene:switched', refresh)
    return () => { unsub1(); unsub2() }
  }, [eventBus, canvas])

  const maybeEmitSceneUpdate = useCallback((changes) => {
    if (!canvas?.scene || !eventBus) return
    Object.assign(canvas.scene, changes)
    eventBus.emitRecord('scene', 'updated', { id: canvas.scene.id, ...changes })
  }, [canvas, eventBus])

  const handleToggleLighting = useCallback(() => {
    const next = !lighting
    setLighting(next)
    canvas.setLightingEnabled(next)
    canvas.scene.lightingEnabled = next
    maybeEmitSceneUpdate({ lightingEnabled: next })
    if (next) canvas.refreshLighting()
  }, [canvas, lighting, maybeEmitSceneUpdate])

  const handleSetAmbient = useCallback((e) => {
    const val = Number(e.target.value)
    setAmbient(val)
    canvas.scene.ambientLight = val
    maybeEmitSceneUpdate({ ambientLight: val })
    canvas.refreshLighting()
  }, [canvas, maybeEmitSceneUpdate])

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

  const handleToggleViewAll = useCallback(() => {
    const next = !viewAll
    setViewAll(next)
    if (canvas?.controller) {
      canvas.controller.viewAll = next
      canvas.refreshLighting()
    }
  }, [canvas, viewAll])

  const handleViewpointSelect = useCallback((e) => {
    const id = e.target.value
    setViewpointId(id)
    if (!canvas?.controller) return
    if (id) {
      canvas.controller.viewAll = false
      setViewAll(false)
      canvas.setViewpoint(id)
    } else {
      canvas.controller.setViewpoint([])
      canvas.controller.viewAll = true
      setViewAll(true)
      canvas.refreshLighting()
    }
  }, [canvas])

  return (
    <div className="vtt-panel vtt-lighting-panel">
      <h4>Lighting & Vision</h4>
      <label className="vtt-toggle">
        <input type="checkbox" checked={lighting} onChange={handleToggleLighting} />
        Lighting
      </label>
      <label>Ambient Light (0-1)
        <input type="range" min="0" max="1" step="0.05" value={ambient} onChange={handleSetAmbient} className="vtt-range" />
      </label>

      <label className="vtt-toggle">
        <input type="checkbox" checked={viewAll} onChange={handleToggleViewAll} />
        GM View All
      </label>

      <label>View from token
        <select value={viewpointId} onChange={handleViewpointSelect} className="vtt-input">
          <option value="">— None (view all) —</option>
          {tokens.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </label>

      <hr className="vtt-divider" />

      <h4>Grid & Ruler</h4>
      <label>Unit per grid cell
        <input type="number" min="0.1" step="1" value={gridUnit} onChange={handleGridUnitChange} className="vtt-input" />
      </label>
      <label>Unit label
        <input type="text" value={gridUnitLabel} onChange={handleGridUnitLabelChange} className="vtt-input" placeholder="e.g. ft, m" />
      </label>
    </div>
  )
}

/* ── Actor Panel ────────────────────────────────────────────── */
function ActorPanel({ canvas, eventBus, scene, isDm, session, connectedUsers }) {
  const [actors, setActors] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [items, setItems] = useState([])
  const itemsMapRef = useRef(new Map())

  /* Sync actors from controller.actorMap */
  useEffect(() => {
    if (!canvas?.controller) return
    function refresh() {
      setActors(Array.from(canvas.controller.actorMap.values()))
    }
    refresh()
    const offs = [
      eventBus?.on('actors-changed', refresh),
    ]
    return () => { offs.forEach(o => o?.()) }
  }, [canvas, eventBus])

  /* Keep items in sync via EventBus */
  useEffect(() => {
    const map = itemsMapRef.current
    const refresh = () => setItems(Array.from(map.values()))
    const offs = [
      eventBus?.on('item:created', (data) => { map.set(data.id, data); refresh() }),
      eventBus?.on('item:updated', (data) => { map.set(data.id, { ...map.get(data.id), ...data }); refresh() }),
      eventBus?.on('item:deleted', (data) => { map.delete(data.id); refresh() }),
    ]
    return () => { offs.forEach(o => o?.()) }
  }, [eventBus])

  const selected = selectedId ? actors.find(a => a.id === selectedId) : null
  const actorItems = selected ? items.filter(i => i.actorId === selected.id) : []

  const handleCreate = useCallback(() => {
    if (!eventBus) return
    const actor = new Actor({ name: 'New Character' })
    eventBus.emitRecord('actor', 'created', actor.toJSON())
    setSelectedId(actor.id)
  }, [eventBus])

  const handleDelete = useCallback((id) => {
    if (!eventBus) return
    eventBus.emitRecord('actor', 'deleted', { id })
    if (selectedId === id) setSelectedId(null)
  }, [eventBus, selectedId])

  return (
    <div className="vtt-panel vtt-actor-panel">
      <h4>Actors ({actors.length})</h4>
      {isDm && <button onClick={handleCreate} className="btn btn-sm vtt-action-btn">+ Actor</button>}
      <div className="vtt-token-list" style={{ maxHeight: 200, overflowY: 'auto', marginTop: 4 }}>
        {actors.filter(a => isDm || hasAccess(session, a, 'observer')).map(a => (
          <div
            key={a.id}
            className={`vtt-token-item ${a.id === selectedId ? 'selected' : ''}`}
            onClick={() => setSelectedId(a.id)}
          >
            <span className="vtt-token-name">{a.name}</span>
            <span className="vtt-token-pos">({a.actorType})</span>
            {isDm && (
              <button onClick={(e) => { e.stopPropagation(); handleDelete(a.id) }} className="btn btn-sm vtt-disconnect-btn">✕</button>
            )}
          </div>
        ))}
      </div>

      {selected && (
        <ActorDetail
          actor={selected}
          items={actorItems}
          isDm={isDm}
          session={session}
          eventBus={eventBus}
          canvas={canvas}
          scene={scene}
          connectedUsers={connectedUsers}
        />
      )}
    </div>
  )
}

/* ── Actor Detail ──────────────────────────────────────────── */
function ActorDetail({ actor, items, isDm, session, eventBus, canvas, scene, connectedUsers }) {
  const [name, setName] = useState(actor.name)
  const [actorType, setActorType] = useState(actor.actorType)
  const [img, setImg] = useState(actor.img ?? '')
  const [attrsJson, setAttrsJson] = useState(JSON.stringify(actor.attributes ?? {}, null, 2))
  const [ownershipDefault, setOwnershipDefault] = useState(actor.ownership?.default ?? 'none')
  const [grantUserId, setGrantUserId] = useState('')
  const [grantLevel, setGrantLevel] = useState('owner')
  const [websiteUsers, setWebsiteUsers] = useState([])
  const [websiteUsersError, setWebsiteUsersError] = useState(false)

  const canEdit = isDm || hasAccess(session, actor, 'owner')

  const existingGrants = actor.ownership?.users ?? {}
  const grantedUserIds = new Set(Object.keys(existingGrants))

  const connectedUserIds = new Set((connectedUsers ?? []).map(u => u.userId))

  let availableUsers
  if (isDm && websiteUsers.length > 0) {
    availableUsers = websiteUsers
      .filter(u => u.id !== session?.userId && u.role !== 'dm' && !grantedUserIds.has(u.id))
      .map(u => ({ userId: u.id, username: u.username, role: u.role, online: connectedUserIds.has(u.id) }))
  } else {
    availableUsers = (connectedUsers ?? [])
      .filter(u => u.userId !== session?.userId && u.role !== 'dm' && !grantedUserIds.has(u.userId))
      .map(u => ({ ...u, online: true }))
  }

  const lookupUser = (uid) => {
    const fromRoster = websiteUsers.find(u => u.id === uid)
    if (fromRoster) return fromRoster
    return (connectedUsers ?? []).find(u => u.userId === uid)
  }

  useEffect(() => {
    setName(actor.name)
    setActorType(actor.actorType)
    setImg(actor.img ?? '')
    setAttrsJson(JSON.stringify(actor.attributes ?? {}, null, 2))
    setOwnershipDefault(actor.ownership?.default ?? 'none')
  }, [actor])

  useEffect(() => {
    if (!isDm) return
    let cancelled = false
    fetch('/api/auth/users', { credentials: 'same-origin' })
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(data => { if (!cancelled && data.ok) setWebsiteUsers(data.users) })
      .catch(() => { if (!cancelled) setWebsiteUsersError(true) })
    return () => { cancelled = true }
  }, [isDm])

  const handleSave = useCallback(() => {
    if (!eventBus || !canEdit) return
    let attrs
    try { attrs = JSON.parse(attrsJson) } catch { attrs = actor.attributes }
    const changes = { name, actorType, img, attributes: attrs, ownership: { ...actor.ownership, default: ownershipDefault } }
    eventBus.emitRecord('actor', 'updated', { id: actor.id, ...changes })
  }, [eventBus, canEdit, actor, name, actorType, img, attrsJson, ownershipDefault])

  const handleGrant = useCallback(() => {
    if (!eventBus || !canEdit || !grantUserId) return
    const users = { ...actor.ownership?.users, [grantUserId]: grantLevel }
    eventBus.emitRecord('actor', 'updated', { id: actor.id, ownership: { ...actor.ownership, users } })
    setGrantUserId('')
  }, [eventBus, canEdit, actor, grantUserId, grantLevel])

  const handleRevoke = useCallback((uid) => {
    if (!eventBus || !canEdit) return
    const users = { ...actor.ownership?.users }
    delete users[uid]
    eventBus.emitRecord('actor', 'updated', { id: actor.id, ownership: { ...actor.ownership, users } })
  }, [eventBus, canEdit, actor])

  const handleAddItem = useCallback(() => {
    if (!eventBus || !canEdit) return
    const item = new Item({ name: 'New Item', actorId: actor.id })
    eventBus.emitRecord('item', 'created', item.toJSON())
  }, [eventBus, canEdit, actor])

  const handleDeleteItem = useCallback((itemId) => {
    if (!eventBus || !canEdit) return
    eventBus.emitRecord('item', 'deleted', { id: itemId })
  }, [eventBus, canEdit])

  return (
    <div className="vtt-token-props">
      <hr className="vtt-divider" />
      <h4>{actor.name}</h4>

      {canEdit ? (
        <>
          <label>Name <input value={name} onChange={e => setName(e.target.value)} className="vtt-input" /></label>
          <label>Type <input value={actorType} onChange={e => setActorType(e.target.value)} className="vtt-input" /></label>
          <label>Image URL <input value={img} onChange={e => setImg(e.target.value)} className="vtt-input" /></label>

          <hr className="vtt-divider" />
          <h5>Attributes (JSON)</h5>
          <textarea value={attrsJson} onChange={e => setAttrsJson(e.target.value)} className="vtt-input" rows={4} style={{ fontFamily: 'monospace', fontSize: 11 }} />

          <hr className="vtt-divider" />
          <h5>Ownership</h5>

          <label>Default
            <select value={ownershipDefault} onChange={e => setOwnershipDefault(e.target.value)} className="vtt-input">
              {OWNERSHIP_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>

          {availableUsers.length > 0 ? (
            <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
              <select value={grantUserId} onChange={e => setGrantUserId(e.target.value)} className="vtt-input" style={{ flex: 1 }}>
                <option value="">— Select user —</option>
                {availableUsers.map(u => (
                  <option key={u.userId} value={u.userId}>{u.username} ({u.role}){u.online ? ' • online' : ''}</option>
                ))}
              </select>
              <select value={grantLevel} onChange={e => setGrantLevel(e.target.value)} className="vtt-input" style={{ width: 80 }}>
                <option value="observer">observer</option>
                <option value="owner">owner</option>
              </select>
              <button onClick={handleGrant} className="btn btn-sm vtt-action-btn">Grant</button>
            </div>
          ) : isDm && websiteUsersError ? (
            <em style={{ fontSize: 12 }}>Could not load users</em>
          ) : (
            <em style={{ fontSize: 12 }}>No users available to grant</em>
          )}

          {Object.entries(existingGrants).length > 0 && (
            <div style={{ marginTop: 4 }}>
              {Object.entries(existingGrants).map(([uid, level]) => {
                const user = lookupUser(uid)
                return (
                  <div key={uid} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '2px 0' }}>
                    <span>{user ? user.username : uid + ' (offline)'}: <strong>{level}</strong></span>
                    <button onClick={() => handleRevoke(uid)} className="btn btn-sm vtt-disconnect-btn">✕</button>
                  </div>
                )
              })}
            </div>
          )}

          <button onClick={handleSave} className="btn btn-sm vtt-connect-btn" style={{ marginTop: 8 }}>Save Actor</button>

          {actor.actorType === 'scene-portal' && (
            <>
              <hr className="vtt-divider" />
              <h5>Scene Portal</h5>
              <label>Target Scene
                <select value={actor.attributes?.sceneId ?? ''} onChange={e => {
                  const sid = e.target.value
                  actor.attributes = { ...actor.attributes, sceneId: sid || null }
                  handleSave()
                }} className="vtt-input">
                  <option value="">— Select scene —</option>
                  {(canvas?.sceneManager?.scenes ?? []).map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>
            </>
          )}

          <hr className="vtt-divider" />
          <h5>Inventory ({items.length})</h5>
          <button onClick={handleAddItem} className="btn btn-sm vtt-action-btn">+ Item</button>
          {items.map(item => (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '2px 0' }}>
              <span>{item.name} (x{item.quantity ?? 1})</span>
              <button onClick={() => handleDeleteItem(item.id)} className="btn btn-sm vtt-disconnect-btn">✕</button>
            </div>
          ))}
        </>
      ) : (
        <>
          <p><strong>Type:</strong> {actor.actorType}</p>
          <p><strong>Attributes:</strong></p>
          <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap' }}>{JSON.stringify(actor.attributes, null, 2)}</pre>
          {items.length > 0 && (
            <>
              <p><strong>Inventory:</strong></p>
              {items.map(item => (
                <div key={item.id} style={{ fontSize: 12 }}>{item.name} (x{item.quantity ?? 1})</div>
              ))}
            </>
          )}
        </>
      )}
    </div>
  )
}

/* ── Main cockpit ──────────────────────────────────────────── */
export default function VttCockpit({ canvas, eventBus, scene, isDm, session, connectedUsers, onDisconnect }) {
  const [activeTool, setActiveTool] = useState('pan')
  const [showAddToken, setShowAddToken] = useState(false)
  const [showTokenPanel, setShowTokenPanel] = useState(false)
  const [showScenePanel, setShowScenePanel] = useState(false)
  const [showActorPanel, setShowActorPanel] = useState(false)
  const [showBgPanel, setShowBgPanel] = useState(false)
  const [showLighting, setShowLighting] = useState(false)
  const [activeWidgets, setActiveWidgets] = useState([])

  /* Game-like window shell: one stack, one Esc handler (see windowStack.js).
     I = inventory · L = loot · P = party · Esc = close the top overlay. */
  const win = useWindowStack()
  const [lootPileId, setLootPileId] = useState(null)
  const [focusActorId, setFocusActorId] = useState(null)
  const [placement, setPlacement] = useState(null)
  const placementRef = useRef(null)
  useEffect(() => { placementRef.current = placement }, [placement])
  useVttHotkeys({ dispatch: win.dispatch, hasTop: !!win.top, enabled: !placement })

  // Begin drop-to-ground: close overlays, then the next map click places the pile.
  const startPlacement = useCallback((item) => {
    setPlacement({ itemId: item.id, name: item.name })
    win.dispatch({ type: 'closeAll' })
  }, [win])

  // Cancel placement on Escape.
  useEffect(() => {
    if (!placement) return
    const onKey = (e) => { if (e.key === 'Escape') setPlacement(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [placement])

  /* Clicking a loot-pile token opens the loot panel; while placing, the next
     empty-map click drops the pending item as a pile there. */
  useEffect(() => {
    const controller = canvas?.controller
    if (!controller) return
    const prevToken = controller.onTokenClicked
    const prevScene = controller.onSceneClicked
    controller.onTokenClicked = (tokenData) => {
      const actor = controller.actorMap?.get(tokenData?.actorId)
      const p = placementRef.current
      if (p && actor?.actorType === 'loot-pile') {
        controller.transferItem?.({ itemId: p.itemId, toActorId: actor.id }); setPlacement(null); return
      }
      if (actor?.actorType === 'loot-pile') { setLootPileId(actor.id); win.open('loot') }
      else if (actor?.actorType === 'scene-portal') {
        const sceneId = actor.attributes?.sceneId
        const sm = canvas?.sceneManager
        if (sceneId && sm?.scenes.some(s => s.id === sceneId)) {
          sm.switchScene(sceneId)
        }
      }
      else prevToken?.(tokenData)
    }
    controller.onSceneClicked = (x, y) => {
      const p = placementRef.current
      if (p) {
        controller.createLootPile?.({ x: x - 35, y: y - 35, fromItemId: p.itemId, name: p.name })
        setPlacement(null); return
      }
      prevScene?.(x, y)
    }
    return () => {
      if (canvas?.controller) {
        canvas.controller.onTokenClicked = prevToken
        canvas.controller.onSceneClicked = prevScene
      }
    }
  }, [canvas, win])

  /* Sync active tool to canvas controller once canvas is available */
  useEffect(() => {
    if (canvas?.controller) {
      canvas.setTool(activeTool)
    }
  }, [canvas, activeTool])

  const handleToolSelect = useCallback((tool) => {
    setActiveTool(prev => prev === tool && tool === 'token' ? 'pan' : tool)
  }, [])

  const handleTopBarAction = useCallback((id) => {
    switch (id) {
      case 'inventory': win.open('inventory'); break
      case 'loot': win.open('loot'); break
      case 'party': win.open('party'); break
      case 'add-token': setShowAddToken(true); break
      case 'tokens-panel': setShowTokenPanel(p => !p); break
      case 'scenes': setShowScenePanel(p => !p); break
      case 'actors-panel': setShowActorPanel(p => !p); break
      case 'bg': setShowBgPanel(p => !p); break
      case 'lighting': setShowLighting(p => !p); break
      case 'disconnect': onDisconnect?.(); break
      case 'home': window.location.href = '/'; break
      default: break
    }
  }, [win, onDisconnect])

  const handleOpenScreen = useCallback((id) => {
    win.open(id)
  }, [win])

  return (
    <>
      <VttTopBar
        isDm={isDm}
        onAction={handleTopBarAction}
        onToolSelect={handleToolSelect}
        activeTool={activeTool}
        activeWidgets={activeWidgets}
        onWidgetsChange={setActiveWidgets}
      />

      <VttHud
        canvas={canvas}
        eventBus={eventBus}
        scene={scene}
        isDm={isDm}
        win={win}
        onOpenScreen={handleOpenScreen}
      />

      <div className="vtt-panels-container">
        {(activeWidgets.includes('tokens') || showTokenPanel) && (
          <TokenPanel canvas={canvas} eventBus={eventBus} scene={scene} isDm={isDm} session={session} />
        )}
        {(activeWidgets.includes('scenes') || showScenePanel) && (
          <VttScenePanel canvas={canvas} eventBus={eventBus} connectedUsers={connectedUsers} isDm={isDm} />
        )}
        {(activeWidgets.includes('actors') || showActorPanel) && (
          <ActorPanel canvas={canvas} eventBus={eventBus} scene={scene} isDm={isDm} session={session} connectedUsers={connectedUsers} />
        )}
        {(activeWidgets.includes('bg') || showBgPanel) && (
          <BackgroundPanel canvas={canvas} eventBus={eventBus} scene={scene} />
        )}
        {(activeWidgets.includes('lighting') || showLighting) && (
          <LightingPanel canvas={canvas} isDm={isDm} eventBus={eventBus} />
        )}
      </div>

      {showAddToken && (
        <AddTokenModal canvas={canvas} eventBus={eventBus} onClose={() => setShowAddToken(false)} userId={session?.userId} />
      )}

      {win.stack.map(id => {
        if (id === 'inventory') return (
          <InventoryScreen key="inventory" controller={canvas?.controller} eventBus={eventBus}
            session={session} initialActorId={focusActorId} onDropToGround={startPlacement}
            onClose={() => win.close('inventory')} />
        )
        if (id === 'loot') return (
          <LootPanel key="loot" controller={canvas?.controller} eventBus={eventBus}
            session={session} initialPileId={lootPileId} onClose={() => win.close('loot')} />
        )
        if (id === 'party') return (
          <PartyPanel key="party" controller={canvas?.controller} eventBus={eventBus} session={session}
            onSelect={(actorId) => { setFocusActorId(actorId); win.open('inventory') }}
            onClose={() => win.close('party')} />
        )
        return null
      })}
      {placement && (
        <div className="vtt-place-banner">
          <span>Click the map to drop <b>{placement.name}</b>, or a loot pile to add it</span>
          <button className="inv-btn" onClick={() => setPlacement(null)}>Cancel (Esc)</button>
        </div>
      )}
    </>
  )
}
