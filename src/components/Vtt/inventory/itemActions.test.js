import { describe, it, expect } from 'vitest'
import { availableItemActions, pickEquipSlot } from './itemActions.js'

describe('availableItemActions', () => {
  const owns = { owns: true, canGive: true }

  it('returns nothing for items you do not own', () => {
    expect(availableItemActions({ slot: 'body' }, { owns: false, canGive: true })).toEqual([])
  })

  it('offers equip + give + drop + delete for an unequipped wearable', () => {
    expect(availableItemActions({ slot: 'body', equipped: false }, owns)).toEqual(['equip', 'give', 'drop', 'delete'])
  })

  it('offers unequip + delete for an equipped item (no give/drop while worn)', () => {
    expect(availableItemActions({ slot: 'body', equipped: true }, owns)).toEqual(['unequip', 'delete'])
  })

  it('offers split for a stack of more than one', () => {
    expect(availableItemActions({ stackable: true, quantity: 5 }, owns)).toContain('split')
    expect(availableItemActions({ stackable: true, quantity: 1 }, owns)).not.toContain('split')
  })

  it('drops to ground even with no stash, but no give', () => {
    expect(availableItemActions({ itemType: 'misc' }, { owns: true, canGive: false })).toEqual(['drop', 'delete'])
  })

  it('offers attune for an equipped item that requires attunement', () => {
    const eq = { slot: 'neck', equipped: true, attunement: { required: true, attuned: false } }
    expect(availableItemActions(eq, owns)).toContain('attune')
    const attuned = { ...eq, attunement: { required: true, attuned: true } }
    expect(availableItemActions(attuned, owns)).toContain('unattune')
  })

  it('offers identify/unidentify only to the DM', () => {
    const item = { itemType: 'misc', identified: false }
    expect(availableItemActions(item, { owns: false, isDm: true })).toContain('identify')
    expect(availableItemActions({ itemType: 'misc', identified: true }, { owns: false, isDm: true })).toContain('unidentify')
    expect(availableItemActions(item, { owns: true, isDm: false })).not.toContain('identify')
  })
})

describe('pickEquipSlot', () => {
  it('uses the item slot for non-rings', () => {
    expect(pickEquipSlot({ slot: 'mainHand' }, {})).toBe('mainHand')
  })
  it('rings pick the first free ring slot', () => {
    expect(pickEquipSlot({ slot: 'ring' }, {})).toBe('ring1')
    expect(pickEquipSlot({ slot: 'ring' }, { ring1: {} })).toBe('ring2')
    expect(pickEquipSlot({ slot: 'ring' }, { ring1: {}, ring2: {} })).toBe('ring1')
  })
  it('returns null for non-equippable items', () => {
    expect(pickEquipSlot({ slot: null }, {})).toBe(null)
  })
})
