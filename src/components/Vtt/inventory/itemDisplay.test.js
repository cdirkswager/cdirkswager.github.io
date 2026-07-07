import { describe, it, expect } from 'vitest'
import { displayItem, sortItems, valueInGp, prettyType } from './itemDisplay.js'

describe('valueInGp', () => {
  it('converts mixed coinage to gold', () => {
    expect(valueInGp({ gp: 5 })).toBe(5)
    expect(valueInGp({ pp: 1, sp: 5 })).toBeCloseTo(10.5)
    expect(valueInGp(null)).toBe(0)
  })
})

describe('displayItem (identification)', () => {
  const wand = { name: 'Wand of Fire', itemType: 'wondrous', rarity: 'rare', identified: false, description: 'secret', effects: [{ target: 'ac', mode: 'add', value: 1 }] }

  it('masks unidentified items for players', () => {
    const d = displayItem(wand, { isDm: false })
    expect(d.name).toBe('Unidentified Wondrous Item')
    expect(d.showEffects).toBe(false)
    expect(d.unidentified).toBe(true)
  })

  it('shows the truth to the DM but flags it', () => {
    const d = displayItem(wand, { isDm: true })
    expect(d.name).toBe('Wand of Fire')
    expect(d.showEffects).toBe(true)
    expect(d.unidentified).toBe(true)
  })

  it('shows identified items normally', () => {
    const d = displayItem({ ...wand, identified: true }, { isDm: false })
    expect(d.name).toBe('Wand of Fire')
    expect(d.unidentified).toBe(false)
  })
})

describe('prettyType', () => {
  it('labels types', () => {
    expect(prettyType('wondrous')).toBe('Wondrous Item')
    expect(prettyType('weapon')).toBe('Weapon')
  })
})

describe('sortItems', () => {
  const items = [
    { name: 'Beta', itemType: 'potion', rarity: 'common', weight: 2, value: { gp: 5 }, order: 2 },
    { name: 'Alpha', itemType: 'weapon', rarity: 'legendary', weight: 1, value: { gp: 50 }, order: 1 },
    { name: 'Gamma', itemType: 'armor', rarity: 'rare', weight: 10, value: { gp: 1 }, order: 0 },
  ]
  const names = (arr) => arr.map(i => i.name)

  it('manual uses the persisted order', () => {
    expect(names(sortItems(items, 'manual'))).toEqual(['Gamma', 'Alpha', 'Beta'])
  })
  it('name sorts alphabetically', () => {
    expect(names(sortItems(items, 'name'))).toEqual(['Alpha', 'Beta', 'Gamma'])
  })
  it('weight sorts heaviest first', () => {
    expect(names(sortItems(items, 'weight'))).toEqual(['Gamma', 'Beta', 'Alpha'])
  })
  it('value sorts most valuable first', () => {
    expect(names(sortItems(items, 'value'))).toEqual(['Alpha', 'Beta', 'Gamma'])
  })
  it('rarity sorts by descending rarity', () => {
    expect(names(sortItems(items, 'rarity'))).toEqual(['Alpha', 'Gamma', 'Beta'])
  })
  it('does not mutate the input', () => {
    const copy = [...items]
    sortItems(items, 'name')
    expect(items).toEqual(copy)
  })
})
