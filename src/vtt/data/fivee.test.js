import { describe, it, expect } from 'vitest'
import {
  abilityMod, proficiencyBonusForLevel, carryCapacity, encumbranceFor,
  levelForXp, slotAcceptsItem, defaultCharacterAttributes, SKILLS, CONDITIONS,
} from './fivee.js'

describe('fivee — ability & proficiency math', () => {
  it('ability modifiers follow floor((score-10)/2)', () => {
    expect(abilityMod(10)).toBe(0)
    expect(abilityMod(18)).toBe(4)
    expect(abilityMod(7)).toBe(-2)
    expect(abilityMod(1)).toBe(-5)
    expect(abilityMod(20)).toBe(5)
  })

  it('proficiency bonus scales with level', () => {
    expect(proficiencyBonusForLevel(1)).toBe(2)
    expect(proficiencyBonusForLevel(4)).toBe(2)
    expect(proficiencyBonusForLevel(5)).toBe(3)
    expect(proficiencyBonusForLevel(9)).toBe(4)
    expect(proficiencyBonusForLevel(17)).toBe(6)
    expect(proficiencyBonusForLevel(20)).toBe(6)
  })

  it('level derives from XP thresholds', () => {
    expect(levelForXp(0)).toBe(1)
    expect(levelForXp(6500)).toBe(5)
    expect(levelForXp(6499)).toBe(4)
    expect(levelForXp(355000)).toBe(20)
  })
})

describe('fivee — carrying capacity & encumbrance', () => {
  it('capacity = STR * 15 * size multiplier', () => {
    expect(carryCapacity(15)).toBe(225)
    expect(carryCapacity(10)).toBe(150)
    expect(carryCapacity(15, 'large')).toBe(450)
    expect(carryCapacity(15, 'small')).toBe(225)
  })

  it('encumbrance thresholds at STR*5 and STR*10', () => {
    expect(encumbranceFor(15, 50).level).toBe('none')
    expect(encumbranceFor(15, 100).level).toBe('encumbered')
    expect(encumbranceFor(15, 100).speedPenalty).toBe(10)
    expect(encumbranceFor(15, 160).level).toBe('heavilyEncumbered')
    expect(encumbranceFor(15, 160).speedPenalty).toBe(20)
  })
})

describe('fivee — slots & defaults', () => {
  it('rings fit either ring slot; other items must match exactly', () => {
    expect(slotAcceptsItem({ slot: 'ring' }, 'ring1')).toBe(true)
    expect(slotAcceptsItem({ slot: 'ring' }, 'ring2')).toBe(true)
    expect(slotAcceptsItem({ slot: 'ring' }, 'body')).toBe(false)
    expect(slotAcceptsItem({ slot: 'body' }, 'body')).toBe(true)
    expect(slotAcceptsItem({ slot: 'body' }, 'head')).toBe(false)
    expect(slotAcceptsItem({ slot: null }, 'body')).toBe(false)
  })

  it('default character attributes are a valid schema-1 sheet', () => {
    const a = defaultCharacterAttributes()
    expect(a.schema).toBe(1)
    expect(a.abilities).toEqual({ str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 })
    expect(a.attunement.max).toBe(3)
    expect(Object.keys(SKILLS).length).toBe(18)
    expect(CONDITIONS).toContain('poisoned')
  })

  it('overrides merge into defaults', () => {
    const a = defaultCharacterAttributes({ abilities: { str: 16, dex: 14, con: 12, int: 10, wis: 10, cha: 8 } })
    expect(a.abilities.str).toBe(16)
    expect(a.schema).toBe(1)
  })
})