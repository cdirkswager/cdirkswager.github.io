import { useState, useRef, useCallback, useEffect } from 'react'
import { Actor } from '../../vtt/canvas/Actor.js'
import { ITEM_CATALOG, createSeedItem } from '../../data/seedItems.js'

/* ── Add Items Modal ────────────────────────────────── */
function LootAddModal({ onAdd, onClose }) {
  const [search, setSearch] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const lower = search.toLowerCase()
  const filtered = ITEM_CATALOG.filter(t =>
    t.name.toLowerCase().includes(lower) ||
    t.type.toLowerCase().includes(lower)
  )

  return (
    <div className="vtt-modal-overlay" onClick={onClose}>
      <div className="vtt-loot-add-modal" onClick={e => e.stopPropagation()}>
        <div className="vtt-loot-add-header">
          <h4>Add Items to Loot</h4>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search items..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="vtt-input"
            autoFocus
          />
        </div>
        <div className="vtt-loot-add-grid">
          {filtered.length === 0 ? (
            <div className="vtt-loot-add-empty">No items match your search.</div>
          ) : (
            filtered.map((t, i) => (
              <button key={i} className="vtt-loot-add-item" onClick={() => onAdd(t)}>
                {t.img && <img src={t.img} alt="" className="vtt-loot-add-icon" />}
                <span className="vtt-loot-add-name">{t.name}</span>
                <span className="vtt-loot-add-type">{t.type}</span>
              </button>
            ))
          )}
        </div>
        <div className="vtt-loot-add-footer">
          <span className="vtt-hint">{filtered.length} items</span>
          <button onClick={onClose} className="btn btn-sm vtt-action-btn">Close</button>
        </div>
      </div>
    </div>
  )
}

/* ── Helpers ────────────────────────────────────────── */
function findOrCreatePlayerActor(actors, session, eventBus) {
  if (!session?.userId) return null
  const match = actors.find(a => {
    const uid = a.attributes?.userId ?? a.data?.userId ?? null
    return uid === session.userId
  })
  if (match) return match

  const fallback = actors.find(a =>
    a.actorType === 'character' && a.ownership?.default === 'owner'
  )
  if (fallback) return fallback

  const actor = new Actor({
    name: session.username ?? 'Character',
    actorType: 'character',
    ownership: { default: 'owner', users: {} },
    attributes: { userId: session.userId },
  })
  eventBus.emitRecord('actor', 'created', actor.toJSON())
  return actor
}

/* ── Main Loot Panel ───────────────────────────────── */
export default function VttLootPanel({ eventBus, canvas, isDm, session, onClose, initialLootPileId }) {
  const [lootPiles, setLootPiles] = useState([])
  const [selectedId, setSelectedId] = useState(initialLootPileId ?? null)
  const [allItems, setAllItems] = useState([])
  const [showAddModal, setShowAddModal] = useState(false)
  const prevInitialRef = useRef(initialLootPileId)

  /* Sync loot-pile actors from canvas controller */
  useEffect(() => {
    if (!canvas?.controller) return
    function refresh() {
      const actors = Array.from(canvas.controller.actorMap.values())
      setLootPiles(actors.filter(a => a.actorType === 'loot-pile'))
    }
    refresh()
    const off = eventBus?.on('actors-changed', refresh)
    return () => { off?.() }
  }, [canvas, eventBus])

  /* Sync items */
  useEffect(() => {
    if (!canvas?.controller) return
    function refresh() {
      setAllItems(Array.from(canvas.controller.itemMap?.values() ?? []))
    }
    refresh()
    const off = eventBus?.on('items-changed', refresh)
    return () => { off?.() }
  }, [canvas, eventBus])

  /* Pick up initialLootPileId changes (from token click) */
  useEffect(() => {
    if (initialLootPileId && initialLootPileId !== prevInitialRef.current) {
      setSelectedId(initialLootPileId)
      prevInitialRef.current = initialLootPileId
    }
  }, [initialLootPileId])

  const selectedPile = lootPiles.find(a => a.id === selectedId)
  const pileItems = selectedId
    ? allItems.filter(i => i.actorId === selectedId).sort((a, b) => a.name?.localeCompare(b.name))
    : []

  const handleCreateLoot = useCallback(() => {
    if (!eventBus || !canvas) return
    const name = prompt('Name this loot pile:')
    if (!name) return
    const actor = new Actor({
      name,
      actorType: 'loot-pile',
      ownership: { default: 'owner', users: {} },
    })
    eventBus.emitRecord('actor', 'created', actor.toJSON())

    try {
      const renderer = canvas.renderer
      const cx = renderer.app.renderer.width / 2
      const cy = renderer.app.renderer.height / 2
      const center = renderer.screenToWorld(cx, cy)
      const token = canvas.addToken({
        name,
        x: center.x - 50,
        y: center.y - 50,
        width: 100,
        height: 100,
        actorId: actor.id,
      })
      eventBus.emitRecord('token', 'created', token.toJSON())
    } catch (e) {
      console.warn('Could not create loot token:', e)
    }

    setSelectedId(actor.id)
  }, [eventBus, canvas])

  const handleAddItem = useCallback((template) => {
    if (!eventBus || !selectedId) return
    const item = createSeedItem(template, selectedId)
    eventBus.emitRecord('item', 'created', item.toJSON())
  }, [eventBus, selectedId])

  const handleLootItem = useCallback((item) => {
    if (!eventBus || !canvas?.controller || !session) return
    const actors = Array.from(canvas.controller.actorMap.values())
    const playerActor = findOrCreatePlayerActor(actors, session, eventBus)
    if (!playerActor) return

    eventBus.emitRecord('item', 'updated', {
      id: item.id,
      actorId: playerActor.id,
      containerId: null,
    })
  }, [eventBus, canvas, session])

  const handleLootAll = useCallback(() => {
    for (const item of pileItems) {
      handleLootItem(item)
    }
  }, [pileItems, handleLootItem])

  const handleDeletePile = useCallback((id) => {
    if (!eventBus || !canvas) return
    if (selectedId === id) setSelectedId(null)
    eventBus.emitRecord('actor', 'deleted', { id })

    const token = canvas.scene?.tokens?.find(t => t.actorId === id)
    if (token) {
      canvas.scene.removeToken(token.id)
      canvas.renderer?.removeToken?.(token.id)
      eventBus.emitRecord('token', 'deleted', { id: token.id })
    }
  }, [eventBus, canvas, selectedId])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="vtt-loot-overlay">
      <div className="vtt-loot-layout">
        <div className="vtt-loot-sidebar">
          <div className="vtt-loot-sidebar-header">
            <h4>Loot</h4>
            <button onClick={onClose} className="vtt-item-card-close" title="Close">✕</button>
          </div>
          <div className="vtt-loot-list">
            {isDm && (
              <button onClick={handleCreateLoot} className="vtt-loot-create-btn">+ New Loot</button>
            )}
            {lootPiles.length === 0 && (
              <div className="vtt-loot-empty">No loot piles yet.</div>
            )}
            {lootPiles.map(pile => (
              <div
                key={pile.id}
                className={`vtt-loot-entry ${pile.id === selectedId ? 'selected' : ''}`}
                onClick={() => setSelectedId(pile.id)}
              >
                <span className="vtt-loot-entry-name">{pile.name}</span>
                <span className="vtt-loot-entry-count">{allItems.filter(i => i.actorId === pile.id).length}</span>
                {isDm && (
                  <button
                    className="vtt-loot-entry-del"
                    onClick={e => { e.stopPropagation(); if (window.confirm('Delete this loot pile?')) handleDeletePile(pile.id) }}
                    title="Delete"
                  >✕</button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="vtt-loot-main">
          {!selectedPile ? (
            <div className="vtt-loot-main-empty">
              <p>Select a loot pile or create one.</p>
            </div>
          ) : (
            <>
              <div className="vtt-loot-main-header">
                <div>
                  <h3>{selectedPile.name}</h3>
                  <span className="vtt-inv-actor-type">Loot Pile</span>
                </div>
                <div className="vtt-loot-main-actions">
                  {isDm && (
                    <button onClick={() => setShowAddModal(true)} className="btn btn-sm vtt-action-btn">
                      Add Items
                    </button>
                  )}
                  {pileItems.length > 0 && (
                    <button onClick={handleLootAll} className="btn btn-sm vtt-connect-btn">
                      Loot All
                    </button>
                  )}
                </div>
              </div>

              <div className="vtt-loot-items">
                {pileItems.length === 0 ? (
                  <div className="vtt-loot-empty">No items in this pile.</div>
                ) : (
                  <div className="vtt-loot-item-list">
                    {pileItems.map(item => (
                      <div key={item.id} className="vtt-loot-item-row">
                        {item.img && <img src={item.img} alt="" className="vtt-inv-icon" />}
                        <span className="vtt-loot-item-name">{item.name}</span>
                        <span className="vtt-loot-item-qty">x{item.quantity ?? 1}</span>
                        <span className="vtt-loot-item-weight">{item.weight}lb</span>
                        <button
                          className="btn btn-sm vtt-connect-btn vtt-loot-btn"
                          onClick={() => handleLootItem(item)}
                          title="Add to your inventory"
                        >
                          Loot
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {showAddModal && (
        <LootAddModal
          onAdd={handleAddItem}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  )
}
