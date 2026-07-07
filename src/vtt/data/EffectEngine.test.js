import { describe, it, expect } from 'vitest'
import { computeDerived, activeItems } from './EffectEngine.js'
import { defaultCharacterAttributes } from './fivee.js'
import { seedItem } from './seedItems.js'

function rogue() {
  return {
    id: 'a1', name: 'Lyra',
    attributes: defaultCharacterAttributes({
      biography: { class: 'Rogue', level: 5, size: 'medium' },
      abilities: { str: 10, dex: 18, con: 14, int: 12, wis: 10, cha: 14 },
      hp: { current: 38, max: 38, temp: 0 },
      ac: { base: 10 },
      proficiencies: { savingThrows: ['dex', 'int'], skills: ['stealth', 'perception'], weapons: [], armor: [], tools: [], languages: [] },
    }),
  }
}

const equip = (item, { attuned = false } = {}) => ({
  ...item, equipped: true,
  attunement: { ...(item.attunement || {}), attuned: item.attunement?.required ? attuned : true },
})

describe('EffectEngine — base derivation', () => {
  it('derives mods, proficiency, initiative, unarmored AC', () => {
    const d = computeDerived(rogue(), [])
    expect(d.mods.dex).toBe(4)
    expect(d.proficiencyBonus).toBe(3)
    expect(d.initiative).toBe(4)
    expect(d.ac).toBe(14)
  })

  it('passive perception includes proficiency', () => {
    const d = computeDerived(rogue(), [])
    expect(d.senses.passivePerception).toBe(13)
  })

  it('skill and save totals apply proficiency', () => {
    const d = computeDerived(rogue(), [])
    expect(d.skills.stealth).toBe(7)
    expect(d.skills.arcana).toBe(1)
    expect(d.saves.dex).toBe(7)
    expect(d.saves.str).toBe(0)
  })
})

describe('EffectEngine — armor & shields', () => {
  it('light armor uses full dex', () => {
    const armor = equip(seedItem('Leather Armor', 'a1'))
    const d = computeDerived(rogue(), [armor])
    expect(d.ac).toBe(15)
  })

  it('heavy armor caps dex at 0', () => {
    const armor = equip(seedItem('Chain Mail', 'a1'))
    const d = computeDerived(rogue(), [armor])
    expect(d.ac).toBe(16)
  })

  it('shield adds its flat bonus', () => {
    const armor = equip(seedItem('Leather Armor', 'a1'))
    const shield = equip(seedItem('Shield', 'a1'))
    const d = computeDerived(rogue(), [armor, shield])
    expect(d.ac).toBe(17)
  })
})

describe('EffectEngine — attunement gating', () => {
  it('a required-attunement item does nothing until attuned', () => {
    const cloakOff = equip(seedItem('Cloak of Protection', 'a1'), { attuned: false })
    expect(activeItems([cloakOff]).length).toBe(0)
    expect(computeDerived(rogue(), [cloakOff]).ac).toBe(14)

    const cloakOn = equip(seedItem('Cloak of Protection', 'a1'), { attuned: true })
    expect(computeDerived(rogue(), [cloakOn]).ac).toBe(15)
  })

  it('reports attunement usage', () => {
    const cloakOn = equip(seedItem('Cloak of Protection', 'a1'), { attuned: true })
    const d = computeDerived(rogue(), [cloakOn])
    expect(d.attunement.used).toBe(1)
    expect(d.attunement.max).toBe(3)
  })
})

describe('EffectEngine — speed, senses, stacking', () => {
  it('boots add walking speed (attuned)', () => {
    const boots = equip(seedItem('Boots of Striding', 'a1'), { attuned: true })
    expect(computeDerived(rogue(), [boots]).speed.walk).toBe(40)
  })

  it('amulet grants darkvision via max', () => {
    const amulet = equip(seedItem('Amulet of Darkvision', 'a1'))
    expect(computeDerived(rogue(), [amulet]).senses.darkvision).toBe(60)
  })

  it('multiple AC sources stack additively', () => {
    const armor = equip(seedItem('Leather Armor', 'a1'))
    const shield = equip(seedItem('Shield', 'a1'))
    const ring = equip(seedItem('Ring of Protection', 'a1'), { attuned: true })
    const cloak = equip(seedItem('Cloak of Protection', 'a1'), { attuned: true })
    const d = computeDerived(rogue(), [armor, shield, ring, cloak])
    expect(d.ac).toBe(19)
  })
})

describe('EffectEngine — encumbrance feeds back into speed', () => {
  it('heavy load slows walking and adds a condition', () => {
    const actor = rogue()
    const anvil = { id: 'x', itemType: 'misc', weight: 160, quantity: 1, parentItemId: null }
    const d = computeDerived(actor, [anvil])
    expect(d.carry.encumbrance).toBe('heavilyEncumbered')
    expect(d.speed.walk).toBe(10)
    expect(d.conditions).toContain('heavilyEncumbered')
  })
})