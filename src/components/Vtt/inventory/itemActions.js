import { RING_SLOTS } from '../../../vtt/data/fivee.js'

export function availableItemActions(item, { owns, canGive, isDm } = {}) {
  if (!item) return []
  const acts = []
  if (owns) {
    if (item.slot && !item.equipped) acts.push('equip')
    if (item.equipped) acts.push('unequip')
    if (item.equipped && item.attunement?.required) acts.push(item.attunement.attuned ? 'unattune' : 'attune')
    if (item.stackable && (item.quantity ?? 1) > 1) acts.push('split')
    if (canGive && !item.equipped) acts.push('give')
    if (!item.equipped) acts.push('drop')
  }
  if (isDm) acts.push(item.identified === false ? 'identify' : 'unidentify')
  if (owns) acts.push('delete')
  return acts
}

export const ACTION_LABELS = {
  equip: 'Equip', unequip: 'Unequip', attune: 'Attune', unattune: 'Break attunement',
  split: 'Split\u2026', give: 'Give to party stash', drop: 'Drop to ground',
  identify: 'Identify', unidentify: 'Mark unidentified', delete: 'Delete',
}

export function pickEquipSlot(item, equipment = {}) {
  if (!item?.slot) return null
  if (item.slot === 'ring') {
    for (const s of RING_SLOTS) if (!equipment[s]) return s
    return RING_SLOTS[0]
  }
  return item.slot
}
