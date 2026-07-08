import React, { useEffect, useState, useCallback } from 'react'
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core'
import { useInventoryModel } from './useInventoryModel.js'
import { getAccessLevel } from '../../../vtt/canvas/ownership.js'
import { resolveDrop } from './dndIntent.js'
import { HoverCardProvider } from './HoverCard.jsx'
import PartyRail from './PartyRail.jsx'
import Paperdoll from './Paperdoll.jsx'
import CharacterPanel from './CharacterPanel.jsx'
import ItemGrid from './ItemGrid.jsx'
import { IconMenu, IconMap, IconBag, IconBook, IconUser, IconClose, IconCoin, IconWeight } from './icons.jsx'

export default function InventoryScreen({ controller, actions, eventBus, session, initialActorId, onClose }) {
  const model = useInventoryModel({ controller, eventBus, session, initialActorId })
  const user = { userId: session?.userId, role: session?.role }
  const accessOf = (a) => getAccessLevel(user, a)

  const [activeItem, setActiveItem] = useState(null)
  const [toast, setToast] = useState(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

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
      case 'equip':    actions?.equipItem(action.itemId, action.slot); break
      case 'unequip':  actions?.unequipItem(action.itemId); break
      case 'move':     actions?.moveItem(action.itemId, action.parentItemId, { unequip: action.unequip }); break
      case 'transfer': actions?.transferItem({ itemId: action.itemId, toActorId: action.toActorId }); break
      case 'invalid':
        setToast(action.reason === 'wrong-slot' ? "That doesn't go there"
          : action.reason === 'not-owner' ? "You don't control this character" : 'Not allowed')
        setTimeout(() => setToast(null), 2200)
        break
      default: break
    }
  }, [actions, model])

  const gp = model.currency?.gp ?? 0
  const carried = model.carry?.carried ?? 0
  const cap = model.carry?.capacity ?? 0

  return (
    <div className="inv-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.() }}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <HoverCardProvider isDm={session?.role === 'dm'}>
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
                paperdoll={<Paperdoll selected={model.selected} equipment={model.equipment} locked={!model.owns} isDm={session?.role === 'dm'} onUnequip={(id) => actions?.unequipItem(id)} />}
              />
            </div>
            <ItemGrid model={model} actions={actions} isDm={session?.role === 'dm'} />
          </div>

          {toast && <div className="inv-toast">{toast}</div>}
        </div>
        </HoverCardProvider>

        <DragOverlay dropAnimation={null}>
          {activeItem
            ? <div className="inv-cell filled inv-drag-ghost"><img src={activeItem.img} alt="" /></div>
            : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
