import { describe, it, expect } from 'vitest'
import { resolveDrop, parseDndId } from './dndIntent.js'

const items = {
  sword: { id: 'sword', slot: 'mainHand', equipped: false, parentItemId: null },
  armor: { id: 'armor', slot: 'body', equipped: false, parentItemId: null },
  ring: { id: 'ring', slot: 'ring', equipped: false, parentItemId: null },
  wornRing: { id: 'wornRing', slot: 'ring', equipped: true, equippedSlot: 'ring1', parentItemId: null },
  gem: { id: 'gem', slot: null, equipped: false, parentItemId: 'pack' },
  potion: { id: 'potion', slot: null, equipped: false, parentItemId: null },
}
const ctx = (over = {}) => ({ getItem: (id) => items[id], owns: true, gridActorId: 'me', ...over })

describe('parseDndId', () => {
  it('splits type and id on the first colon', () => {
    expect(parseDndId('item:abc')).toEqual({ t: 'item', id: 'abc' })
    expect(parseDndId('grid')).toEqual({ t: 'grid', id: null })
    expect(parseDndId('slot:ring2')).toEqual({ t: 'slot', id: 'ring2' })
  })
})

describe('resolveDrop', () => {
  it('equips a legal item into a matching slot', () => {
    expect(resolveDrop('item:sword', 'slot:mainHand', ctx()))
      .toEqual({ kind: 'equip', itemId: 'sword', slot: 'mainHand' })
  })

  it('rings fit either ring slot', () => {
    expect(resolveDrop('item:ring', 'slot:ring2', ctx()).kind).toBe('equip')
    expect(resolveDrop('item:ring', 'slot:ring1', ctx()).slot).toBe('ring1')
  })

  it('rejects the wrong slot', () => {
    expect(resolveDrop('item:armor', 'slot:head', ctx()))
      .toEqual({ kind: 'invalid', reason: 'wrong-slot' })
  })

  it('rejects equipping onto an actor you do not own', () => {
    expect(resolveDrop('item:sword', 'slot:mainHand', ctx({ owns: false })))
      .toEqual({ kind: 'invalid', reason: 'not-owner' })
  })

  it('unequips when dragging an equipped item to the grid', () => {
    expect(resolveDrop('equip:wornRing', 'grid', ctx()))
      .toEqual({ kind: 'unequip', itemId: 'wornRing' })
  })

  it('moves an item out of a container to the grid', () => {
    expect(resolveDrop('item:gem', 'grid', ctx()))
      .toEqual({ kind: 'move', itemId: 'gem', parentItemId: null, unequip: false })
  })

  it('moves a loose item into a container', () => {
    expect(resolveDrop('item:potion', 'container:pack', ctx()))
      .toEqual({ kind: 'move', itemId: 'potion', parentItemId: 'pack', unequip: false })
  })

  it('does nothing dropping an item onto its own container', () => {
    expect(resolveDrop('item:gem', 'container:pack', ctx()).kind).toBe('noop')
  })

  it('transfers when dropping on another party member', () => {
    expect(resolveDrop('item:sword', 'party:ally', ctx()))
      .toEqual({ kind: 'transfer', itemId: 'sword', toActorId: 'ally' })
  })

  it('does nothing dropping on the current owner', () => {
    expect(resolveDrop('item:sword', 'party:me', ctx()).kind).toBe('noop')
  })

  it('unequip takes priority: equipped item into a container also unequips', () => {
    expect(resolveDrop('equip:wornRing', 'container:pack', ctx()))
      .toEqual({ kind: 'move', itemId: 'wornRing', parentItemId: 'pack', unequip: true })
  })
})
