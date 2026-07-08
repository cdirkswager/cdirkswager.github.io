import { useState, useEffect, useCallback, useRef } from 'react'
import { Actor } from '../../../vtt/canvas/Actor.js'
import { Item } from '../../../vtt/canvas/Item.js'
import { hasAccess, OWNERSHIP_LEVELS } from '../../../vtt/canvas/ownership.js'

/* ── Actor Panel ────────────────────────────────────────────── */
export default function ActorPanel({ canvas, eventBus, scene, isDm, session, connectedUsers }) {
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
