import React from 'react'
import { SLOT_LABELS } from '../../../vtt/data/fivee.js'
import { Draggable, Droppable } from './dnd.jsx'

const LEFT = ['head', 'body', 'hands', 'feet', 'ring1', 'neck']
const RIGHT = ['mainHand', 'offHand', 'ranged', 'ammo', 'ring2', 'cloak']

function Slot({ slot, item, locked, onUnequip }) {
  return (
    <Droppable id={`slot:${slot}`} className="inv-slot-wrapper" data={{ slot }} disabled={locked}>
      <div className={`inv-slot${item ? ' filled' : ''}`} title={item ? item.name : SLOT_LABELS[slot]}>
        {item
          ? <Draggable id={`equip:${item.id}`} data={{ itemId: item.id }} disabled={locked}>
              <img src={item.img} alt={item.name} draggable={false} onDoubleClick={() => !locked && onUnequip?.(item.id)} />
            </Draggable>
          : <span className="inv-slot-ghost">{SLOT_LABELS[slot]}</span>}
      </div>
    </Droppable>
  )
}

export default function Paperdoll({ selected, equipment, locked, onUnequip }) {
  const hero = selected?.attributes?.portrait || selected?.img
  const initial = (selected?.name || '?').charAt(0).toUpperCase()
  return (
    <div className="inv-paperdoll">
      <div className="inv-slotcol">
        {LEFT.map(s => <Slot key={s} slot={s} item={equipment[s]} locked={locked} onUnequip={onUnequip} />)}
      </div>
      <div className="inv-hero">
        {hero ? <img src={hero} alt={selected?.name} /> : <div className="inv-hero-fallback">{initial}</div>}
      </div>
      <div className="inv-slotcol">
        {RIGHT.map(s => <Slot key={s} slot={s} item={equipment[s]} locked={locked} onUnequip={onUnequip} />)}
      </div>
    </div>
  )
}
