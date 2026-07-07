import { describe, it, expect } from 'vitest'
import { availableItemActions, pickEquipSlot } from './itemActions.js'

describe('availableItemActions', () => {
  const equipCtx = { owns: true, canGive: false, equipment: {} }

  it('returns equip action for unequipped slot item', () => {
    const item = { slot: 'body', equipped: false }
    const acts = availableItemActions(item, equipCtx)
    expect(acts.find(a => a.action === 'equip')).toBeTruthy()
  })

  it('returns unequip action for equipped item', () => {
    const item = { slot: 'mainHand', equipped: true }
    const acts = availableItemActions(item, equipCtx)
    expect(acts.find(a => a.action === 'unequip')).toBeTruthy()
  })

  it('returns split action for stackable item with quantity > 1', () => {
    const item = { stackable: true, quantity: 5, slot: null, equipped: false }
    const acts = availableItemActions(item, equipCtx)
    expect(acts.find(a => a.action === 'split')).toBeTruthy()
  })

  it('does not return split for single items', () => {
    const item = { stackable: true, quantity: 1, slot: null, equipped: false }
    const acts = availableItemActions(item, equipCtx)
    expect(acts.find(a => a.action === 'split')).toBeFalsy()
  })

  it('returns give action when canGive is true', () => {
    const item = { slot: null, equipped: false }
    const acts = availableItemActions(item, { owns: false, canGive: true, equipment: {} })
    expect(acts.find(a => a.action === 'give')).toBeTruthy()
  })

  it('returns delete action when owns', () => {
    const item = { slot: null, equipped: false }
    const acts = availableItemActions(item, equipCtx)
    expect(acts.find(a => a.action === 'delete')).toBeTruthy()
  })

  it('marks delete as danger', () => {
    const item = { slot: null, equipped: false }
    const acts = availableItemActions(item, equipCtx)
    const del = acts.find(a => a.action === 'delete')
    expect(del.danger).toBe(true)
  })

  it('returns empty array for null item', () => {
    expect(availableItemActions(null, equipCtx)).toEqual([])
  })
})

describe('pickEquipSlot', () => {
  it('returns item.slot when slotAcceptsItem matches', () => {
    expect(pickEquipSlot({ slot: 'mainHand' }, {})).toBe('mainHand')
  })

  it('returns first free ring slot for ring items', () => {
    expect(pickEquipSlot({ slot: 'ring' }, {})).toBe('ring1')
  })

  it('returns second ring slot when first is occupied', () => {
    expect(pickEquipSlot({ slot: 'ring' }, { ring1: { name: 'Ring of Protection' } })).toBe('ring2')
  })

  it('returns ring1 when both ring slots are occupied (fallback)', () => {
    const equipment = { ring1: { name: 'A' }, ring2: { name: 'B' } }
    expect(pickEquipSlot({ slot: 'ring' }, equipment)).toBe('ring1')
  })

  it('returns null for items without a slot', () => {
    expect(pickEquipSlot({ slot: null }, {})).toBe(null)
  })
})
