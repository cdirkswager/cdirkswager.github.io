import React from 'react'
import { SLOT_LABELS } from '../../../vtt/data/fivee.js'
import { Draggable, Droppable } from './dnd.jsx'
import { useHoverCard } from './HoverCard.jsx'

const LEFT = ['head', 'body', 'hands', 'feet', 'ring1', 'neck']
const RIGHT = ['mainHand', 'offHand', 'ranged', 'ammo', 'ring2', 'cloak']

function Slot({ slot, item, locked, onUnequip }) {
  const hover = useHoverCard()
  const body = item
    ? <img src={item.img} alt={item.name} draggable={false} />
    : <span className="inv-slot-ghost">{SLOT_LABELS[slot]}</span>
  const cell = (
    <Droppable id={`slot:${slot}`} className={`inv-slot${item ? ' filled' : ''}`} disabled={locked}>
      {item && !locked
        ? <Draggable id={`equip:${item.id}`} data={{ itemId: item.id }}>{body}</Draggable>
        : body}
    </Droppable>
  )
  return (
    <div
      title={item ? `${item.name}${!locked ? ' \u2014 double-click to unequip' : ''}` : SLOT_LABELS[slot]}
      onMouseEnter={item ? (e) => hover.show(item, e.currentTarget.getBoundingClientRect()) : undefined}
      onMouseLeave={item ? hover.hide : undefined}
      onDoubleClick={item && !locked ? () => onUnequip?.(item.id) : undefined}
    >
      {cell}
    </div>
  )
}

export default function Paperdoll({ selected, equipment, locked, isDm, onUnequip }) {
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
