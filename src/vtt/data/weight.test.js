import { describe, it, expect } from 'vitest'
import {
  itemOwnWeight, actorCarriedWeight, containerFill, itemExternalWeight,
  containerCanAccept, indexItems, wouldCycle, carrySummary,
} from './weight.js'

const bag = (id, capacity, extra = {}) => ({
  id, itemType: 'container', weight: extra.weight ?? 5, quantity: 1,
  parentItemId: extra.parent ?? null, container: { capacity, weightless: !!extra.weightless },
})
const thing = (id, weight, parent = null, quantity = 1) => ({
  id, itemType: 'misc', weight, quantity, parentItemId: parent,
})

describe('weight — own weight', () => {
  it('multiplies by quantity', () => {
    expect(itemOwnWeight({ weight: 2, quantity: 3 })).toBe(6)
    expect(itemOwnWeight({ weight: 0.05, quantity: 20 })).toBe(1)
    expect(itemOwnWeight(null)).toBe(0)
  })
})

describe('weight — nesting & carried total (no double counting)', () => {
  const items = [
    thing('sword', 2),
    bag('pack', 30),
    thing('a', 4, 'pack'),
    thing('b', 4, 'pack'),
  ]

  it('container fill sums its contents', () => {
    const idx = indexItems(items)
    expect(containerFill(items[1], idx)).toBe(8)
  })

  it('container external weight = own + contents', () => {
    const idx = indexItems(items)
    expect(itemExternalWeight(items[1], idx)).toBe(13)
  })

  it('actor carried = loose + container external, counted once', () => {
    expect(actorCarriedWeight(items)).toBe(15)
  })
})

describe('weight — weightless container (bag of holding)', () => {
  const items = [
    bag('boh', 500, { weight: 15, weightless: true }),
    thing('gold', 100, 'boh'),
  ]

  it('contents do not count toward the carrier', () => {
    expect(actorCarriedWeight(items)).toBe(15)
  })

  it('but still fill the container internally', () => {
    const idx = indexItems(items)
    expect(containerFill(items[0], idx)).toBe(100)
  })
})

describe('weight — hard container capacity', () => {
  const items = [bag('pack', 30), thing('a', 8, 'pack')]

  it('rejects an incoming item that overflows', () => {
    const idx = indexItems(items)
    const r = containerCanAccept(items[0], 25, idx)
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('over-capacity')
  })

  it('accepts within capacity', () => {
    const idx = indexItems(items)
    expect(containerCanAccept(items[0], 20, idx).ok).toBe(true)
  })

  it('excludes the moving item from current fill', () => {
    const idx = indexItems(items)
    const r = containerCanAccept(items[0], 8, idx, 'a')
    expect(r.ok).toBe(true)
    expect(r.current).toBe(0)
  })
})

describe('weight — cycle detection', () => {
  it('flags putting a bag inside its own descendant', () => {
    const items = [bag('outer', 30), bag('inner', 10, { parent: 'outer' })]
    const idx = indexItems(items)
    expect(wouldCycle('outer', 'inner', idx)).toBe(true)
    expect(wouldCycle('inner', 'outer', idx)).toBe(false)
  })

  it('allows a normal move', () => {
    const items = [bag('a', 30), bag('b', 30)]
    const idx = indexItems(items)
    expect(wouldCycle('a', 'b', idx)).toBe(false)
  })
})

describe('weight — carry summary', () => {
  it('reports capacity, over, and encumbrance', () => {
    const attrs = { abilities: { str: 10 }, biography: { size: 'medium' } }
    const items = [thing('x', 15)]
    const s = carrySummary(attrs, items)
    expect(s.carried).toBe(15)
    expect(s.capacity).toBe(150)
    expect(s.over).toBe(false)
    expect(s.encumbrance).toBe('none')
  })

  it('flags heavy encumbrance and over-capacity', () => {
    const attrs = { abilities: { str: 10 }, biography: { size: 'medium' } }
    const items = [thing('x', 160)]
    const s = carrySummary(attrs, items)
    expect(s.over).toBe(true)
    expect(s.encumbrance).toBe('heavilyEncumbered')
  })
})