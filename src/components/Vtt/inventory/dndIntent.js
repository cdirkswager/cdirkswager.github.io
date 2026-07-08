import { slotAcceptsItem } from '../../../vtt/data/fivee.js'

/**
 * resolveDrop — pure mapping from a drag (active → over) to an inventory intent.
 * No side effects; the caller executes the returned action.
 *
 * Draggable ids:  'item:<id>' (from grid/container)  |  'equip:<id>' (from a slot)
 * Droppable ids:  'slot:<slotName>' | 'grid' | 'container:<itemId>' | 'party:<actorId>'
 *
 * ctx = { getItem(id), owns, gridActorId }
 * Returns one of:
 *   { kind:'equip', itemId, slot }
 *   { kind:'unequip', itemId }
 *   { kind:'move', itemId, parentItemId, unequip }
 *   { kind:'transfer', itemId, toActorId }
 *   { kind:'invalid', reason }         (illegal, show feedback)
 *   { kind:'noop' }                    (nothing to do)
 */
export function parseDndId(id) {
  if (!id) return { t: null, id: null }
  const i = String(id).indexOf(':')
  if (i === -1) return { t: String(id), id: null }
  return { t: String(id).slice(0, i), id: String(id).slice(i + 1) }
}

export function resolveDrop(activeId, overId, ctx) {
  if (!overId) return { kind: 'noop' }
  const a = parseDndId(activeId)
  const o = parseDndId(overId)
  const itemId = a.id
  const fromEquip = a.t === 'equip'
  const item = ctx.getItem?.(itemId)
  if (!item) return { kind: 'noop' }

  switch (o.t) {
    case 'slot': {
      if (!ctx.owns) return { kind: 'invalid', reason: 'not-owner' }
      if (!slotAcceptsItem(item, o.id)) return { kind: 'invalid', reason: 'wrong-slot' }
      if (item.equipped && item.equippedSlot === o.id) return { kind: 'noop' }
      return { kind: 'equip', itemId, slot: o.id }
    }
    case 'grid': {
      if (fromEquip || item.equipped) return { kind: 'unequip', itemId }
      if (item.parentItemId != null) return { kind: 'move', itemId, parentItemId: null, unequip: false }
      return { kind: 'noop' }
    }
    case 'container': {
      if (o.id === itemId) return { kind: 'noop' }
      if (item.parentItemId === o.id && !item.equipped) return { kind: 'noop' }
      return { kind: 'move', itemId, parentItemId: o.id, unequip: !!item.equipped }
    }
    case 'party': {
      if (o.id === ctx.gridActorId) return { kind: 'noop' }
      return { kind: 'transfer', itemId, toActorId: o.id }
    }
    default:
      return { kind: 'noop' }
  }
}
