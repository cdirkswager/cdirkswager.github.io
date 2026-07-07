import React, { useEffect, useState, useCallback } from 'react'
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core'
import { useInventoryModel } from './useInventoryModel.js'
import { getAccessLevel } from '../../../vtt/canvas/ownership.js'
import { resolveDrop } from './dndIntent.js'
import PartyRail from './PartyRail.jsx'
import Paperdoll from './Paperdoll.jsx'
import CharacterPanel from './CharacterPanel.jsx'
import ItemGrid from './ItemGrid.jsx'
import { IconMenu, IconMap, IconBag, IconBook, IconUser, IconClose, IconCoin, IconWeight } from './icons.jsx'

/**
 * InventoryScreen — full-screen game-like character + inventory overlay with
 * drag-and-drop. Equip (grid→slot), unequip (slot→grid), move (into/out of
 * containers), and transfer (drop on a party portrait). All mutations are
 * optimistic with server-authoritative rollback (see VttSyncBridge). You can
 * only drag items on actors you own; equipped gear of others is locked. Esc closes.
 */
export default function InventoryScreen({ controller, eventBus, session, initialActorId, onClose }) {
  const model = useInventoryModel({ controller, eventBus, session, initialActorId })
  const user = { userId: session?.userId, role: session?.role }
  const accessOf = (a) => getAccessLevel(user, a)

  const [activeItem, setActiveItem] = useState(null)
  const [toast, setToast] = useState(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  // Surface server rejections (e.g. "Container is full", "Illegal equip slot").
  useEffect(() => {
    if (!eventBus) return
    const off = eventBus.on('op-rejected', ({ message }) => {
      setToast(message || 'Action not allowed')
      setTimeout(() => setToast(null), 2600)
    })
    return () => off?.()
  }, [eventBus])

  const onDragStart = useCallback((e) => {
    const id = e.active?.data?.current?.itemId
    setActiveItem(id ? model.getItem(id) : null)
  }, [model])

  const onDragEnd = useCallback((e) => {
    setActiveItem(null)
    const overId = e.over?.id
    if (!overId) return
    const action = resolveDrop(e.active.id, overId, {
      getItem: model.getItem, owns: model.owns, gridActorId: model.gridActor?.id,
    })
    switch (action.kind) {
      case 'equip':    controller?.equipItem?.(action.itemId, action.slot); break
      case 'unequip':  controller?.unequipItem?.(action.itemId); break
      case 'move':     controller?.moveItem?.(action.itemId, action.parentItemId, { unequip: action.unequip }); break
      case 'transfer': controller?.transferItem?.({ itemId: action.itemId, toActorId: action.toActorId }); break
      case 'invalid':
        setToast(action.reason === 'wrong-slot' ? "That doesn't go there"
          : action.reason === 'not-owner' ? "You don't control this character" : 'Not allowed')
        setTimeout(() => setToast(null), 2200)
        break
      default: break
    }
  }, [controller, model])

  const gp = model.currency?.gp ?? 0
  const carried = model.carry?.carried ?? 0
  const cap = model.carry?.capacity ?? 0

  return (
    <div className="inv-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.() }}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="inv-frame" role="dialog" aria-label="Character and inventory">
          <div className="inv-topbar">
            <button className="inv-iconbtn" title="Menu"><IconMenu /></button>
            <button className="inv-iconbtn" title="Map"><IconMap /></button>
            <button className="inv-iconbtn active" title="Inventory"><IconBag /></button>
            <button className="inv-iconbtn" title="Journal"><IconBook /></button>
            <button className="inv-iconbtn" title="Character"><IconUser /></button>
            <div className="inv-topbar-spacer" />
            <div className="inv-stat" title="Party members"><IconUser />{model.party.length}</div>
            <div className="inv-stat" title="Gold"><IconCoin />{gp.toLocaleString()}</div>
            <div className="inv-stat" title="Carried weight"><IconWeight />{carried} / {cap}</div>
            <button className="inv-iconbtn inv-close" title="Close (Esc)" onClick={onClose}><IconClose /></button>
          </div>

          <div className="inv-body">
            <PartyRail
              party={model.party}
              selectedId={model.selectedId}
              accessOf={accessOf}
              onSelect={model.selectActor}
            />
            <div className="inv-center">
              <CharacterPanel
                selected={model.selected}
                derived={model.derived}
                paperdoll={<Paperdoll selected={model.selected} equipment={model.equipment} locked={!model.owns} onUnequip={(id) => controller?.unequipItem?.(id)} />}
              />
            </div>
            <ItemGrid model={model} controller={controller} />
          </div>

          {toast && <div className="inv-toast">{toast}</div>}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeItem
            ? <div className="inv-cell filled inv-drag-ghost"><img src={activeItem.img} alt="" /></div>
            : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
