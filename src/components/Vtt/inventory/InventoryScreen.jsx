import React, { useEffect, useState, useCallback } from 'react'
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, pointerWithin, closestCenter } from '@dnd-kit/core'
import { useInventoryModel } from './useInventoryModel.js'
import { getAccessLevel } from '../../../vtt/canvas/ownership.js'
import { resolveDrop, parseDndId } from './dndIntent.js'
import { availableItemActions } from './itemActions.js'
import { ItemContextMenu, SplitModal } from './ItemContextMenu.jsx'
import PartyRail from './PartyRail.jsx'
import Paperdoll from './Paperdoll.jsx'
import CharacterPanel from './CharacterPanel.jsx'
import ItemGrid from './ItemGrid.jsx'
import { IconMenu, IconMap, IconBag, IconBook, IconUser, IconClose, IconCoin, IconWeight } from './icons.jsx'

export default function InventoryScreen({ controller, eventBus, session, onClose }) {
  const model = useInventoryModel({ controller, eventBus, session })
  const user = { userId: session?.userId, role: session?.role }
  const accessOf = (a) => getAccessLevel(user, a)

  const [activeDrag, setActiveDrag] = useState(null)
  const [toast, setToast] = useState(null)
  const [ctxItem, setCtxItem] = useState(null)
  const [ctxPos, setCtxPos] = useState({ x: 0, y: 0 })
  const [splitItem, setSplitItem] = useState(null)

  const showToast = useCallback((msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }, [])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  useEffect(() => {
    if (!eventBus) return
    const unsub = eventBus.on('op-rejected', (m) => showToast(m.message))
    return unsub
  }, [eventBus, showToast])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose?.() } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const handleDragStart = useCallback(({ active }) => {
    const itemId = parseDndId(active.id).id
    const item = model.getItem(itemId)
    if (item) setActiveDrag(item)
  }, [model])

  const handleDragEnd = useCallback(({ active, over }) => {
    setActiveDrag(null)
    if (!over) return

    const intent = resolveDrop(active.id, over.id, {
      getItem: (id) => model.getItem(id),
      owns: model.owns,
      gridActorId: model.gridActor?.id,
    })

    switch (intent.kind) {
      case 'equip':
        controller?.equipItem?.(intent.itemId, intent.slot)
        break
      case 'unequip':
        controller?.unequipItem?.(intent.itemId)
        break
      case 'move':
        controller?.moveItem?.(intent.itemId, intent.parentItemId, { unequip: intent.unequip })
        break
      case 'transfer':
        controller?.transferItem?.({ itemId: intent.itemId, toActorId: intent.toActorId })
        break
      case 'invalid':
        showToast(intent.reason === 'not-owner' ? "You don't control this character" : "Item doesn't fit there")
        break
    }
  }, [controller, model, showToast])

  const handleDragCancel = useCallback(() => setActiveDrag(null), [])

  const handleContextMenu = useCallback((item, e) => {
    e.preventDefault()
    e.stopPropagation()
    setCtxItem(item)
    setCtxPos({ x: e.clientX, y: e.clientY })
  }, [])

  const runAction = useCallback((action) => {
    const item = ctxItem
    setCtxItem(null)
    if (!item) return
    switch (action.action) {
      case 'equip':
        controller?.equipItem?.(item.id, action.slot)
        break
      case 'unequip':
        controller?.unequipItem?.(item.id)
        break
      case 'split':
        setSplitItem(item)
        break
      case 'give':
        if (model.partyStash) {
          controller?.transferItem?.({ itemId: item.id, toActorId: model.partyStash.id })
        }
        break
      case 'delete':
        controller?.deleteItem?.(item.id)
        break
    }
  }, [ctxItem, controller, model.partyStash])

  const handleSplit = useCallback((quantity) => {
    if (splitItem) controller?.splitStack?.(splitItem.id, quantity)
    setSplitItem(null)
  }, [splitItem, controller])

  const gp = model.currency?.gp ?? 0
  const carried = model.carry?.carried ?? 0
  const cap = model.carry?.capacity ?? 0

  return (
    <div className="inv-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.() }}>
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
        collisionDetection={closestCenter}
      >
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
            <ItemGrid
              model={model}
              onContextMenu={handleContextMenu}
              controller={controller}
            />
          </div>
        </div>

        <DragOverlay dropAnimation={null}>
          {activeDrag ? (
            <div className="drag-overlay">
              <img src={activeDrag.img} alt={activeDrag.name} />
              <span>{activeDrag.name}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {ctxItem && (
        <ItemContextMenu
          item={ctxItem}
          ctx={{ owns: model.owns, canGive: !!model.partyStash && model.gridActor !== model.partyStash, equipment: model.equipment }}
          position={ctxPos}
          onAction={runAction}
          onClose={() => setCtxItem(null)}
        />
      )}

      {splitItem && (
        <SplitModal
          item={splitItem}
          onSplit={handleSplit}
          onClose={() => setSplitItem(null)}
        />
      )}

      {toast && (
        <div className="inv-toast" key={toast}>
          {toast}
        </div>
      )}
    </div>
  )
}
