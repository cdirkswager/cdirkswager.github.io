import React, { useEffect, useState, useCallback } from 'react'
import { DndContext, DragOverlay, pointerWithin } from '@dnd-kit/core'
import { useInventoryModel } from './useInventoryModel.js'
import { getAccessLevel } from '../../../vtt/canvas/ownership.js'
import { resolveDrop, parseDndId } from './dndIntent.js'
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

  const showToast = useCallback((msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }, [])

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
    const item = controller?.itemMap?.get(itemId)
    if (item) setActiveDrag(item)
  }, [controller])

  const handleDragEnd = useCallback(({ active, over }) => {
    setActiveDrag(null)
    if (!over) return

    const intent = resolveDrop(active.id, over.id, {
      getItem: (id) => controller?.itemMap?.get(id),
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

  const gp = model.currency?.gp ?? 0
  const carried = model.carry?.carried ?? 0
  const cap = model.carry?.capacity ?? 0

  return (
    <div className="inv-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.() }}>
      <DndContext
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
        collisionDetection={pointerWithin}
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
                paperdoll={<Paperdoll selected={model.selected} equipment={model.equipment} locked={!model.owns} />}
              />
            </div>
            <ItemGrid model={model} />
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

      {toast && (
        <div className="inv-toast" key={toast}>
          {toast}
        </div>
      )}
    </div>
  )
}
