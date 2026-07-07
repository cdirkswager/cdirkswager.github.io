import React, { useState, useEffect, useMemo } from 'react'
import { getAccessLevel } from '../../../vtt/canvas/ownership.js'
import { SEED_ITEMS, seedItem } from '../../../vtt/data/seedItems.js'
import { RARITY_LABELS } from '../../../vtt/data/fivee.js'
import { IconClose, IconSearch, IconBag } from './icons.jsx'

function useTick(eventBus) {
  const [, bump] = useState(0)
  useEffect(() => {
    if (!eventBus) return
    const f = () => bump(v => v + 1)
    const a = eventBus.on('actors-changed', f)
    const b = eventBus.on('items-changed', f)
    return () => { a?.(); b?.() }
  }, [eventBus])
}

/** DM item picker — searchable seed catalog; click to add to the pile. */
function AddItemsModal({ onPick, onClose }) {
  const [q, setQ] = useState('')
  const list = SEED_ITEMS.filter(i => !q || i.name.toLowerCase().includes(q.toLowerCase()))
  return (
    <div className="inv-modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="inv-modal" style={{ width: 460, maxHeight: '78vh', display: 'flex', flexDirection: 'column' }}>
        <div className="inv-modal-title">Add items to pile</div>
        <div className="inv-search" style={{ marginBottom: 10 }}>
          <IconSearch /><input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search catalog" />
        </div>
        <div className="loot-picker">
          {list.map(it => (
            <button key={it.name} className="loot-picker-item" onClick={() => onPick(it.name)} title={it.name}>
              <img src={it.img} alt="" /><span>{it.name}</span>
            </button>
          ))}
        </div>
        <div className="inv-modal-actions" style={{ marginTop: 12 }}>
          <button className="inv-btn" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}

export default function LootPanel({ controller, eventBus, session, initialPileId, onClose }) {
  useTick(eventBus)
  const user = { userId: session?.userId, role: session?.role }
  const isDm = session?.role === 'dm'

  const [selectedPileId, setSelectedPileId] = useState(initialPileId || null)
  const [targetCharId, setTargetCharId] = useState(null)
  const [picker, setPicker] = useState(false)

  const { piles, pile, pileItems, ownedChars, target } = useMemo(() => {
    const actors = [...(controller?.actorMap?.values() || [])]
    const items = [...(controller?.itemMap?.values() || [])]
    const piles = actors.filter(a => a.actorType === 'loot-pile')
    const pile = actors.find(a => a.id === selectedPileId) || piles[0] || null
    const pileItems = pile ? items.filter(i => i.actorId === pile.id) : []
    const ownedChars = actors.filter(a => a.actorType === 'character' && getAccessLevel(user, a) === 'owner')
    const target = ownedChars.find(c => c.id === targetCharId) || ownedChars[0] || null
    return { piles, pile, pileItems, ownedChars, target }
  }, [controller, selectedPileId, targetCharId, user])

  const loot = (item, qty = null) => {
    if (!target) return
    controller?.transferItem?.({ itemId: item.id, toActorId: target.id, quantity: qty })
  }
  const lootAll = () => { if (target) pileItems.forEach(it => loot(it)) }

  const addItem = (name) => {
    if (!pile) return
    const it = seedItem(name, pile.id)
    if (it) eventBus?.emitRecord('item', 'created', it)
  }
  const newPile = () => controller?.createLootPile?.('Loot')
  const deletePile = () => {
    if (pile) { eventBus?.emitRecord('actor', 'deleted', { id: pile.id }); setSelectedPileId(null) }
  }

  const val = (v) => v ? Object.entries(v).filter(([, n]) => n).map(([k, n]) => `${n}${k}`).join(' ') : ''

  return (
    <div className="inv-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.() }}>
      <div className="loot-frame" role="dialog" aria-label="Loot">
        <div className="inv-topbar">
          <IconBag /><span className="loot-heading">Loot</span>
          <div className="inv-topbar-spacer" />
          {ownedChars.length > 0 && (
            <label className="loot-target">
              Loot to&nbsp;
              <select value={target?.id || ''} onChange={e => setTargetCharId(e.target.value)}>
                {ownedChars.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          )}
          <button className="inv-iconbtn inv-close" title="Close (Esc)" onClick={onClose}><IconClose /></button>
        </div>

        <div className="loot-body">
          <div className="loot-rail">
            {piles.length === 0 && <div className="inv-empty">No loot piles</div>}
            {piles.map(p => {
              const count = [...(controller?.itemMap?.values() || [])].filter(i => i.actorId === p.id).length
              return (
                <button key={p.id} className={`loot-pile-btn${p.id === (pile?.id) ? ' active' : ''}`} onClick={() => setSelectedPileId(p.id)}>
                  <IconBag /><span>{String(p.name ?? '')}</span><em>{count}</em>
                </button>
              )
            })}
            {isDm && <button className="inv-btn" style={{ marginTop: 10 }} onClick={newPile}>+ New pile</button>}
          </div>

          <div className="loot-main">
            {!pile ? <div className="inv-empty">Select or create a loot pile</div> : (
              <>
                <div className="loot-main-head">
                  <div className="loot-title">{String(pile.name ?? '')}</div>
                  <div className="loot-actions">
                    {isDm && <button className="inv-btn" onClick={() => setPicker(true)}>Add items</button>}
                    {pileItems.length > 0 && <button className="inv-btn primary" onClick={lootAll} disabled={!target}>Loot all</button>}
                    {isDm && <button className="inv-btn danger-btn" onClick={deletePile}>Delete pile</button>}
                  </div>
                </div>
                {pileItems.length === 0
                  ? <div className="inv-empty">This pile is empty</div>
                  : (
                    <div className="loot-list">
                      {pileItems.map(it => (
                        <div className="loot-row" key={it.id}>
                          <div className="inv-cell filled" style={{ width: 46, height: 46 }} title={it.description || ''}>
                            <img src={it.img} alt={it.name} />
                            {it.quantity > 1 && <span className="qty">{it.quantity}</span>}
                          </div>
                          <div className="loot-row-info">
                            <div className="loot-row-name">{it.name}</div>
                            <div className="loot-row-meta">
                              {RARITY_LABELS[it.rarity]}{it.weight ? ` · ${it.weight} lb` : ''}{val(it.value) ? ` · ${val(it.value)}` : ''}
                            </div>
                          </div>
                          <button className="inv-btn" onClick={() => loot(it)} disabled={!target}>Loot</button>
                        </div>
                      ))}
                    </div>
                  )}
                {!target && <div className="inv-scope" style={{ padding: '10px 0 0' }}>You have no character to loot into.</div>}
              </>
            )}
          </div>
        </div>
      </div>
      {picker && <AddItemsModal onPick={addItem} onClose={() => setPicker(false)} />}
    </div>
  )
}
