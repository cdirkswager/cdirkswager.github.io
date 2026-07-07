import { slotAcceptsItem, RING_SLOTS } from '../../../vtt/data/fivee.js'

export function availableItemActions(item, { owns, canGive, equipment }) {
  if (!item) return []
  const actions = []

  if (item.slot && owns) {
    if (item.equipped) {
      actions.push({ label: 'Unequip', action: 'unequip', icon: null })
    } else {
      const slot = pickEquipSlot(item, equipment)
      if (slot) {
        actions.push({ label: 'Equip', action: 'equip', slot })
      }
    }
  }

  if (item.stackable && item.quantity > 1 && owns) {
    actions.push({ label: 'Split', action: 'split', icon: null })
  }

  if (canGive) {
    actions.push({ label: 'Give to Stash', action: 'give', icon: null })
  }

  if (owns) {
    actions.push({ label: 'Delete', action: 'delete', icon: null, danger: true })
  }

  return actions
}

export function pickEquipSlot(item, equipment) {
  if (!item || !item.slot) return null
  if (item.slot === 'ring') {
    const free = RING_SLOTS.find(s => !equipment[s])
    return free || RING_SLOTS[0]
  }
  if (slotAcceptsItem(item, item.slot)) return item.slot
  return null
}
