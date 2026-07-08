import { describe, it, expect } from 'vitest'
import { SEED_ITEMS, seedItemsForActor, seedItem, ICONS } from './seedItems.js'
import { ITEM_TYPES } from './fivee.js'

describe('seedItems — catalog integrity', () => {
  it('ships a broad catalog', () => {
    expect(SEED_ITEMS.length).toBeGreaterThanOrEqual(30)
  })

  it('every item has a name, a known itemType, and an SVG icon', () => {
    for (const it of SEED_ITEMS) {
      expect(it.name).toBeTruthy()
      expect(ITEM_TYPES).toContain(it.itemType)
      expect(it.img).toMatch(/^data:image\/svg\+xml,/)
    }
  })

  it('covers weapons, armor, containers, potions, and currency', () => {
    const types = new Set(SEED_ITEMS.map(i => i.itemType))
    for (const t of ['weapon', 'armor', 'shield', 'container', 'potion', 'currency']) {
      expect(types.has(t)).toBe(true)
    }
  })

  it('containers declare a capacity', () => {
    for (const c of SEED_ITEMS.filter(i => i.itemType === 'container')) {
      expect(c.container.capacity).toBeGreaterThan(0)
    }
  })

  it('icons are unique-ish and non-empty', () => {
    expect(Object.keys(ICONS).length).toBeGreaterThanOrEqual(15)
  })
})

describe('seedItems — minting owned copies', () => {
  it('assigns fresh ids, actorId, order, and null parent', () => {
    const items = seedItemsForActor('actor-9')
    const ids = new Set(items.map(i => i.id))
    expect(ids.size).toBe(items.length)
    expect(items.every(i => i.actorId === 'actor-9')).toBe(true)
    expect(items.every(i => i.parentItemId === null)).toBe(true)
    expect(items[0].order).toBe(0)
    expect(items[1].order).toBe(1)
  })

  it('copies are deep — mutating one does not affect the template', () => {
    const a = seedItem('Boots of Striding', 'a1')
    a.effects[0].value = 999
    const b = seedItem('Boots of Striding', 'a2')
    expect(b.effects[0].value).toBe(10)
  })

  it('can mint a subset by name', () => {
    const items = seedItemsForActor('a1', { only: ['Rapier', 'Backpack'] })
    expect(items.map(i => i.name).sort()).toEqual(['Backpack', 'Rapier'])
  })

  it('seedItem returns null for unknown names', () => {
    expect(seedItem('Nonexistent Thing', 'a1')).toBe(null)
  })
})