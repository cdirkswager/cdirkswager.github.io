import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { DndContext, useDraggable, useDroppable, DragOverlay, PointerSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core'
import { Item } from '../../vtt/canvas/Item.js'
import { hasAccess } from '../../vtt/canvas/ownership.js'
import { computeStatDeltas } from '../../vtt/canvas/EffectEngine.js'

const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha']
const ABILITY_LABELS = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' }
const SKILL_KEYS = [
  'acrobatics', 'animalHandling', 'arcana', 'athletics', 'deception',
  'history', 'insight', 'intimidation', 'investigation', 'medicine',
  'nature', 'perception', 'performance', 'persuasion', 'religion',
  'sleightOfHand', 'stealth', 'survival',
]
const SKILL_LABELS = {
  acrobatics: 'Acrobatics', animalHandling: 'Animal Handling', arcana: 'Arcana',
  athletics: 'Athletics', deception: 'Deception', history: 'History',
  insight: 'Insight', intimidation: 'Intimidation', investigation: 'Investigation',
  medicine: 'Medicine', nature: 'Nature', perception: 'Perception',
  performance: 'Performance', persuasion: 'Persuasion', religion: 'Religion',
  sleightOfHand: 'Sleight of Hand', stealth: 'Stealth', survival: 'Survival',
}
const EQUIP_SLOT_KEYS = ['head', 'neck', 'shoulders', 'chest', 'hands', 'ring1', 'ring2', 'mainHand', 'offHand', 'feet']
const EQUIP_SLOT_LABELS = {
  head: 'Head', neck: 'Neck', shoulders: 'Shoulders', chest: 'Chest',
  hands: 'Hands', ring1: 'Ring 1', ring2: 'Ring 2',
  mainHand: 'Main Hand', offHand: 'Off Hand', feet: 'Feet',
}

function mod(score) { return Math.floor((score - 10) / 2) }
function modStr(score) { const m = mod(score); return m >= 0 ? `+${m}` : `${m}` }

/* ── HP Bar ──────────────────────────────────────────────── */
function HpBar({ health, compact }) {
  const max = health?.maxHp ?? 1
  const cur = health?.currentHp ?? 0
  const temp = health?.tempHp ?? 0
  const pct = Math.max(0, Math.min(100, (cur / max) * 100))
  const totalPct = Math.max(0, Math.min(100, ((cur + temp) / max) * 100))
  return (
    <div className={`vtt-hp-bar ${compact ? 'vtt-hp-bar--compact' : ''}`}>
      <div className="vtt-hp-bar-fill" style={{ width: `${pct}%` }} />
      {temp > 0 && <div className="vtt-hp-bar-temp" style={{ width: `${totalPct}%` }} />}
      <span className="vtt-hp-text">{cur}/{max}{temp > 0 ? ` +${temp}` : ''}</span>
    </div>
  )
}

/* ── Draggable Item Wrapper ──────────────────────────────── */
function DraggableItem({ item, children, onClick }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `item:${item.id}`,
    data: { item },
  })
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`vtt-draggable-item ${isDragging ? 'vtt-draggable-item--dragging' : ''}`}
      onClick={onClick}
    >
      {children}
    </div>
  )
}

/* ── Party Sidebar ───────────────────────────────────────── */
function PartySidebar({ actors, selectedId, onSelect, session, isDm }) {
  const characters = actors.filter(a => a.actorType === 'character')
  const partyStash = actors.find(a => a.actorType === 'party-stash')

  return (
    <div className="vtt-inv-sidebar">
      <h4>Party</h4>
      <div className="vtt-inv-sidebar-list">
        {characters.map(a => (
          <div
            key={a.id}
            className={`vtt-party-entry ${a.id === selectedId ? 'selected' : ''}`}
            onClick={() => onSelect(a.id)}
          >
            <div className="vtt-party-avatar">
              {a.img ? (
                <img src={a.img} alt="" />
              ) : (
                <span className="vtt-party-avatar-fallback">{(a.name || '?')[0]}</span>
              )}
            </div>
            <div className="vtt-party-info">
              <div className="vtt-party-name">{a.name}</div>
              {a.health && <HpBar health={a.health} compact />}
            </div>
          </div>
        ))}
        {partyStash && (
          <div
            className={`vtt-party-entry ${partyStash.id === selectedId ? 'selected' : ''}`}
            onClick={() => onSelect(partyStash.id)}
          >
            <div className="vtt-party-avatar">
              <span className="vtt-party-avatar-fallback">&#128230;</span>
            </div>
            <div className="vtt-party-info">
              <div className="vtt-party-name">Party Stash</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Stats Card ──────────────────────────────────────────── */
function StatsCard({ actor, equipDeltas }) {
  const s = useMemo(() => {
    const base = actor.stats || {}
    if (!equipDeltas) return base
    return { ...base, ...equipDeltas.statChanges }
  }, [actor.stats, equipDeltas])

  const h = useMemo(() => {
    const base = actor.health || {}
    if (!equipDeltas) return base
    return { ...base, ...equipDeltas.healthChanges }
  }, [actor.health, equipDeltas])

  const ac = s.baseAC ?? 10

  return (
    <div className="vtt-stats-card">
      <h5>Stats{equipDeltas ? ' (with equipment)' : ''}</h5>
      <div className="vtt-stats-grid">
        {ABILITY_KEYS.map(ab => (
          <div key={ab} className="vtt-stat-block">
            <span className="vtt-stat-label">{ABILITY_LABELS[ab]}</span>
            <span className="vtt-stat-score">{s[ab] ?? 10}</span>
            <span className="vtt-stat-mod">{modStr(s[ab] ?? 10)}</span>
          </div>
        ))}
      </div>
      <div className="vtt-stats-summary">
        <span><strong>AC</strong> {ac}</span>
        <span><strong>HP</strong> {h.currentHp ?? 0}/{h.maxHp ?? 0}{h.tempHp ? ` +${h.tempHp}` : ''}</span>
        <span><strong>Speed</strong> 30</span>
        <span><strong>Init</strong> {modStr(s.dex ?? 10)}</span>
      </div>
      <details className="vtt-skills-details">
        <summary>Saves &amp; Skills</summary>
        <div className="vtt-skills-list">
          {SKILL_KEYS.map(sk => (
            <div key={sk} className="vtt-skill-row">
              <span className="vtt-skill-name">{SKILL_LABELS[sk]}</span>
              <span className={`vtt-skill-val ${(s[sk] ?? 0) > 0 ? 'vtt-skill-val--pos' : ''}`}>
                {modStr(s[sk] ?? 0)}
              </span>
            </div>
          ))}
        </div>
      </details>
    </div>
  )
}

/* ── Droppable Equipment Slot ─────────────────────────────── */
function DroppableSlot({ slot, label, item, canEdit, onUnequip }) {
  const { setNodeRef, isOver } = useDroppable({ id: `equip:${slot}`, data: { slot, type: 'equip' } })
  return (
    <div
      ref={setNodeRef}
      className={`vtt-equip-slot ${isOver ? 'vtt-equip-slot--over' : ''}`}
      title={label}
    >
      <div className="vtt-equip-slot-label">{label}</div>
      {item ? (
        <div className="vtt-equip-item">
          <span className="vtt-equip-item-name">{item.name}</span>
          {canEdit && (
            <button onClick={() => onUnequip(slot, item.id)} className="vtt-equip-unequip" title="Unequip">&#10005;</button>
          )}
        </div>
      ) : (
        <div className="vtt-equip-empty">&mdash;</div>
      )}
    </div>
  )
}

/* ── Equipment Slots ─────────────────────────────────────── */
function EquipmentSlots({ actor, items, canEdit, eventBus }) {
  const equipped = actor.equipment || {}

  const equippedItems = useMemo(() => {
    const map = {}
    for (const item of items) {
      if (item.equipSlot && equipped[item.equipSlot] === item.id) {
        map[item.equipSlot] = item
      }
    }
    return map
  }, [items, equipped])

  const handleUnequip = useCallback((slot, itemId) => {
    if (!canEdit || !eventBus) return
    eventBus.emitRecord('item', 'updated', { id: itemId, equipSlot: null })
    eventBus.emitRecord('actor', 'updated', {
      id: actor.id,
      equipment: { ...equipped, [slot]: null },
    })
  }, [canEdit, eventBus, actor.id, equipped])

  return (
    <div className="vtt-equip-slots">
      <h5>Equipment</h5>
      <div className="vtt-equip-grid">
        {EQUIP_SLOT_KEYS.map(slot => (
          <DroppableSlot
            key={slot}
            slot={slot}
            label={EQUIP_SLOT_LABELS[slot]}
            item={equippedItems[slot]}
            canEdit={canEdit}
            onUnequip={handleUnequip}
          />
        ))}
      </div>
    </div>
  )
}

/* ── Drop zone for containers & stash ─────────────────────── */
function DroppableZone({ id, data, className, children, ...rest }) {
  const { setNodeRef, isOver } = useDroppable({ id, data })
  return (
    <div ref={setNodeRef} className={`${className ?? ''} ${isOver ? 'vtt-droppable--over' : ''}`} {...rest}>
      {children}
    </div>
  )
}

/* ── Inventory Section ───────────────────────────────────── */
function InventorySection({ title, items, containers, canEdit, eventBus, onSelectItem, droppableId, dropData, actorId }) {
  const [expanded, setExpanded] = useState(() => {
    const init = {}
    for (const c of containers) init[c.id] = false
    return init
  })
  const [sortKey, setSortKey] = useState('name')
  const [sortAsc, setSortAsc] = useState(true)

  const toggleContainer = useCallback((id) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  }, [])

  const containersWithItems = containers.filter(c => items.some(i => i.containerId === c.id))
  const rootItems = useMemo(() => {
    const filtered = items.filter(i => !i.containerId)
    const sorted = [...filtered].sort((a, b) => {
      let va, vb
      switch (sortKey) {
        case 'weight': va = a.weight ?? 0; vb = b.weight ?? 0; break
        case 'value': va = a.value ?? 0; vb = b.value ?? 0; break
        case 'type': va = a.itemType || a.type || ''; vb = b.itemType || b.type || ''; break
        default: va = a.name.toLowerCase(); vb = b.name.toLowerCase()
      }
      if (va < vb) return sortAsc ? -1 : 1
      if (va > vb) return sortAsc ? 1 : -1
      return 0
    })
    return sorted
  }, [items, sortKey, sortAsc])

  const handleDelete = useCallback((e, id) => {
    e.stopPropagation()
    if (!canEdit || !eventBus) return
    if (!window.confirm('Delete this item?')) return
    eventBus.emitRecord('item', 'deleted', { id })
  }, [canEdit, eventBus])

  const handleAddItem = useCallback(() => {
    if (!eventBus) return
    const item = new Item({ name: 'New Item', actorId })
    eventBus.emitRecord('item', 'created', item.toJSON())
  }, [eventBus, actorId])

  const section = (
    <div className="vtt-inv-section">
      <div className="vtt-inv-section-header">
        <h5>{title}</h5>
        <div className="vtt-inv-sort">
          {['name', 'weight', 'value', 'type'].map(key => (
            <button
              key={key}
              className={`vtt-inv-sort-btn ${sortKey === key ? 'active' : ''}`}
              onClick={() => {
                if (sortKey === key) setSortAsc(p => !p)
                else { setSortKey(key); setSortAsc(true) }
              }}
              title={`Sort by ${key}${sortKey === key ? (sortAsc ? ' ↑' : ' ↓') : ''}`}
            >
              {key === 'name' ? 'N' : key === 'weight' ? 'Wt' : key === 'value' ? 'V' : 'T'}
              {sortKey === key && <span className="vtt-sort-arrow">{sortAsc ? '↑' : '↓'}</span>}
            </button>
          ))}
        </div>
        <span className="vtt-inv-section-count">{items.length}</span>
      </div>
      {containersWithItems.length === 0 && rootItems.length === 0 && (
        <p className="vtt-hint">No items</p>
      )}
      {containersWithItems.map(container => (
        <div key={container.id} className="vtt-container-group">
          <DroppableZone id={`container:${container.id}`} data={{ type: 'container', containerId: container.id }} className="vtt-container-header" onClick={() => toggleContainer(container.id)}>
            <span className="vtt-container-arrow">{expanded[container.id] ? '▾' : '▸'}</span>
            <span className="vtt-container-name">{container.name}</span>
            <span className="vtt-container-weight">
              {items.filter(i => i.containerId === container.id)
                .reduce((sum, i) => sum + (i.weight || 0) * (i.quantity || 1), 0)} lbs
            </span>
          </DroppableZone>
          {expanded[container.id] && (
            <div className="vtt-container-items">
              {items.filter(i => i.containerId === container.id).map(item => (
                <DraggableItem key={item.id} item={item} onClick={() => onSelectItem(item)}>
{item.img && <img src={item.img} alt="" className="vtt-inv-icon" />}
                  <span className="vtt-inv-item-name">{item.name}</span>
                  <span className="vtt-inv-item-qty">x{item.quantity ?? 1}</span>
                  <span className="vtt-inv-item-weight">{((item.weight || 0) * (item.quantity || 1)).toFixed(1)} lbs</span>
                  {canEdit && (
                    <button onClick={(e) => handleDelete(e, item.id)} className="vtt-inv-item-del" title="Delete">&#10005;</button>
                  )}
                </DraggableItem>
              ))}
            </div>
          )}
        </div>
      ))}
      {rootItems.map(item => (
        <DraggableItem key={item.id} item={item} onClick={() => onSelectItem(item)}>
          {item.img && <img src={item.img} alt="" className="vtt-inv-icon" />}
          <span className="vtt-inv-item-qty">x{item.quantity ?? 1}</span>
          <span className="vtt-inv-item-weight">{((item.weight || 0) * (item.quantity || 1)).toFixed(1)} lbs</span>
          {canEdit && (
            <button onClick={(e) => handleDelete(e, item.id)} className="vtt-inv-item-del" title="Delete">&#10005;</button>
          )}
        </DraggableItem>
      ))}
      {canEdit && (
        <button onClick={handleAddItem} className="btn btn-sm vtt-action-btn" style={{ marginTop: 4 }}>+ Item</button>
      )}
    </div>
  )

  if (droppableId) {
    return (
      <DroppableZone id={droppableId} data={dropData ?? { type: 'generic' }}>
        {section}
      </DroppableZone>
    )
  }

  return section
}

/* ── Item Detail Card ────────────────────────────────────── */
function ItemDetailCard({ item, onClose, canEdit, eventBus, onEquip }) {
  if (!item) return null

  const handleDelete = useCallback(() => {
    if (!canEdit || !eventBus) return
    if (!window.confirm(`Delete "${item.name}"?`)) return
    eventBus.emitRecord('item', 'deleted', { id: item.id })
    onClose()
  }, [canEdit, eventBus, item.id, item.name, onClose])

  return (
    <div className="vtt-item-card">
      <div className="vtt-item-card-header">
        <h5>{item.name}</h5>
        <button onClick={onClose} className="vtt-item-card-close" title="Close">&#10005;</button>
      </div>
      {item.img && <img src={item.img} alt="" className="vtt-item-card-img" />}
      <div className="vtt-item-card-body">
        <div className="vtt-item-card-row"><strong>Type:</strong> {item.itemType || item.type}</div>
        <div className="vtt-item-card-row"><strong>Weight:</strong> {item.weight ?? 0} lbs</div>
        <div className="vtt-item-card-row"><strong>Value:</strong> {item.value ?? 0} {item.currencyType ?? 'gp'}</div>
        {item.damage && (
          <div className="vtt-item-card-row">
            <strong>Damage:</strong> {item.damage.dice} {item.damage.type}
            {item.damage.bonus ? ` +${item.damage.bonus}` : ''}
          </div>
        )}
        {item.armorClass && <div className="vtt-item-card-row"><strong>AC:</strong> {item.armorClass}</div>}
        {item.properties?.length > 0 && (
          <div className="vtt-item-card-row"><strong>Properties:</strong> {item.properties.join(', ')}</div>
        )}
        {item.effects?.length > 0 && (
          <div className="vtt-item-card-row">
            <strong>Effects:</strong>
            <ul className="vtt-item-card-effects">
              {item.effects.map((e, i) => (
                <li key={i}>{e.type}: {e.value ?? e.dice} ({e.condition})</li>
              ))}
            </ul>
          </div>
        )}
        {item.requiresAttunement && (
          <div className="vtt-item-card-row">
            <strong>Attunement:</strong> {item.attuned ? 'Attuned' : 'Required'}
          </div>
        )}
        {item.description && <p className="vtt-item-card-desc">{item.description}</p>}
      </div>
      {canEdit && (
        <div className="vtt-item-card-actions">
          {item.equipable && (
            <button onClick={onEquip} className="btn btn-sm vtt-action-btn">Equip</button>
          )}
          <button onClick={handleDelete} className="btn btn-sm vtt-disconnect-btn">Delete</button>
        </div>
      )}
    </div>
  )
}

/* ── Main Inventory Overlay ──────────────────────────────── */
export default function VttInventory({ canvas, eventBus, isDm, session, onClose }) {
  const [actors, setActors] = useState([])
  const [items, setItems] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [selectedItem, setSelectedItem] = useState(null)
  const [activeItem, setActiveItem] = useState(null)
  const itemsMapRef = useRef(new Map())

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  )

  useEffect(() => {
    if (!canvas?.controller) return
    function refresh() {
      setActors(Array.from(canvas.controller.actorMap.values()))
    }
    refresh()
    const off = eventBus?.on('actors-changed', refresh)
    return () => off?.()
  }, [canvas, eventBus])

  useEffect(() => {
    const map = itemsMapRef.current
    const refresh = () => setItems(Array.from(map.values()))
    /* Pre-populate from central itemMap (survives mount/unmount) */
    if (canvas?.controller?.itemMap) {
      for (const [id, item] of canvas.controller.itemMap) {
        if (!map.has(id)) map.set(id, item)
      }
    }
    const offs = [
      eventBus?.on('item:created', (data) => { map.set(data.id, data); refresh() }),
      eventBus?.on('item:updated', (data) => { map.set(data.id, { ...map.get(data.id), ...data }); refresh() }),
      eventBus?.on('item:deleted', (data) => { map.delete(data.id); refresh() }),
    ]
    refresh()
    return () => offs.forEach(o => o?.())
  }, [eventBus, canvas])

  useEffect(() => {
    if (!selectedId && actors.length > 0) {
      const first = actors.find(a => a.actorType === 'character')
      if (first) setSelectedId(first.id)
    }
  }, [actors, selectedId])

  const handleDragStart = useCallback((event) => {
    setActiveItem(event.active.data.current?.item ?? null)
  }, [])

  const handleDragCancel = useCallback(() => {
    setActiveItem(null)
  }, [])

  const handleDragEnd = useCallback((event) => {
    setActiveItem(null)
    const { active, over } = event
    if (!over || !eventBus) return

    const itemId = active.data.current?.item?.id
    if (!itemId) return

    const targetId = over.id

    if (targetId.startsWith('equip:')) {
      const slot = targetId.replace('equip:', '')
      const actor = actors.find(a => a.id === selectedId)
      if (!actor) return
      eventBus.emitRecord('item', 'updated', { id: itemId, equipSlot: slot })
      eventBus.emitRecord('actor', 'updated', {
        id: selectedId,
        equipment: { ...(actor.equipment || {}), [slot]: itemId },
      })
    } else if (targetId.startsWith('container:')) {
      const containerId = targetId.replace('container:', '')
      eventBus.emitRecord('item', 'updated', { id: itemId, containerId })
    } else if (targetId === 'stash:root') {
      const stash = actors.find(a => a.actorType === 'party-stash')
      if (stash) {
        eventBus.emitRecord('item', 'updated', { id: itemId, actorId: stash.id, containerId: null, equipSlot: null })
      }
    }
  }, [eventBus, actors, selectedId])

  const selectedActor = selectedId ? actors.find(a => a.id === selectedId) : null
  const actorItems = selectedActor ? items.filter(i => i.actorId === selectedId) : []
  const containers = actorItems.filter(i => i.itemType === 'container' || i.type === 'container')

  const partyStash = actors.find(a => a.actorType === 'party-stash')
  const stashItems = partyStash ? items.filter(i => i.actorId === partyStash.id) : []
  const stashContainers = stashItems.filter(i => i.itemType === 'container' || i.type === 'container')

  const canEdit = (actorId) => {
    if (isDm) return true
    const actor = actors.find(a => a.id === actorId)
    return actor ? hasAccess(session, actor, 'owner') : false
  }

  const equippedItems = useMemo(() => {
    if (!selectedActor || selectedActor.actorType === 'party-stash') return []
    const eq = selectedActor.equipment || {}
    return actorItems.filter(i => i.equipSlot && eq[i.equipSlot] === i.id)
  }, [selectedActor, actorItems])

  const equipDeltas = useMemo(() => {
    if (!selectedActor || equippedItems.length === 0) return null
    return computeStatDeltas(selectedActor, equippedItems)
  }, [selectedActor, equippedItems])

  const handleEquip = useCallback((item) => {
    if (!eventBus || !selectedId) return
    const actor = actors.find(a => a.id === selectedId)
    if (!actor) return
    const eq = actor.equipment || {}
    const slot = item.equipSlot || EQUIP_SLOT_KEYS.find(s => !eq[s])
    if (!slot) return
    eventBus.emitRecord('item', 'updated', { id: item.id, equipSlot: slot })
    eventBus.emitRecord('actor', 'updated', {
      id: selectedId,
      equipment: { ...eq, [slot]: item.id },
    })
    setSelectedItem(null)
  }, [eventBus, selectedId, actors])

  return (
    <div className="vtt-inventory-overlay" onClick={onClose}>
      <div className="vtt-inventory-layout" onClick={e => e.stopPropagation()}>
        <PartySidebar
          actors={actors}
          selectedId={selectedId}
          onSelect={(id) => { setSelectedId(id); setSelectedItem(null) }}
          session={session}
          isDm={isDm}
        />

        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}>
          <div className="vtt-inventory-main">
            {selectedActor && selectedActor.actorType !== 'party-stash' && (
              <>
                <div className="vtt-inv-panel-header">
                  <h3>{selectedActor.name}</h3>
                  <span className="vtt-inv-actor-type">{selectedActor.actorType}</span>
                </div>

                <div className="vtt-inv-content">
                  <StatsCard actor={selectedActor} equipDeltas={equipDeltas} />

                  {canEdit(selectedId) && (
                    <EquipmentSlots
                      actor={selectedActor}
                      items={actorItems}
                      canEdit={true}
                      eventBus={eventBus}
                    />
                  )}

                  {canEdit(selectedId) ? (
                    <InventorySection
                      key={`inv-${selectedId}`}
                      title="Inventory"
                      items={actorItems}
                      containers={containers}
                      canEdit={true}
                      eventBus={eventBus}
                      onSelectItem={setSelectedItem}
                      actorId={selectedId}
                    />
                  ) : (
                    <p className="vtt-hint" style={{ marginTop: 12 }}>
                      This character's inventory is private.
                    </p>
                  )}

                  {partyStash && (
                    <InventorySection
                      key={`stash-${partyStash.id}`}
                      title="Party Stash"
                      items={stashItems}
                      containers={stashContainers}
                      canEdit={isDm || hasAccess(session, partyStash, 'owner')}
                      eventBus={eventBus}
                      onSelectItem={setSelectedItem}
                      droppableId="stash:root"
                      dropData={{ type: 'stash' }}
                      actorId={partyStash.id}
                    />
                  )}
                </div>
              </>
            )}

            {selectedActor?.actorType === 'party-stash' && (
              <>
                <div className="vtt-inv-panel-header">
                  <h3>Party Stash</h3>
                </div>
                <div className="vtt-inv-content">
                  <InventorySection
                    key={`stash-view-${selectedId}`}
                    title="Items"
                    items={stashItems}
                    containers={stashContainers}
                    canEdit={isDm || hasAccess(session, partyStash, 'owner')}
                    eventBus={eventBus}
                    onSelectItem={setSelectedItem}
                    actorId={selectedId}
                  />
                </div>
              </>
            )}

            {!selectedActor && (
              <div className="vtt-inv-content">
                <p className="vtt-hint">Select a character from the party list.</p>
              </div>
            )}
          </div>

          <DragOverlay>
            {activeItem ? (
              <div className="vtt-drag-overlay">
                <span className="vtt-inv-item-name">{activeItem.name}</span>
                <span className="vtt-inv-item-qty">x{activeItem.quantity ?? 1}</span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>

        {selectedItem && (
          <ItemDetailCard
            item={selectedItem}
            onClose={() => setSelectedItem(null)}
            canEdit={selectedItem.actorId ? canEdit(selectedItem.actorId) : isDm}
            eventBus={eventBus}
            onEquip={() => handleEquip(selectedItem)}
          />
        )}
      </div>
    </div>
  )
}
