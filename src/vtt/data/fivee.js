export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha']

export const ABILITY_LABELS = {
  str: 'Strength', dex: 'Dexterity', con: 'Constitution',
  int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma',
}

export function abilityMod(score) {
  const s = Number.isFinite(score) ? score : 10
  return Math.floor((s - 10) / 2)
}

export function proficiencyBonusForLevel(level) {
  const lvl = Math.max(1, Math.min(20, Math.floor(level || 1)))
  return Math.floor((lvl - 1) / 4) + 2
}

export const SKILLS = {
  acrobatics: 'dex', animalHandling: 'wis', arcana: 'int', athletics: 'str',
  deception: 'cha', history: 'int', insight: 'wis', intimidation: 'cha',
  investigation: 'int', medicine: 'wis', nature: 'int', perception: 'wis',
  performance: 'cha', persuasion: 'cha', religion: 'int', sleightOfHand: 'dex',
  stealth: 'dex', survival: 'wis',
}

export const SKILL_LABELS = {
  acrobatics: 'Acrobatics', animalHandling: 'Animal Handling', arcana: 'Arcana',
  athletics: 'Athletics', deception: 'Deception', history: 'History',
  insight: 'Insight', intimidation: 'Intimidation', investigation: 'Investigation',
  medicine: 'Medicine', nature: 'Nature', perception: 'Perception',
  performance: 'Performance', persuasion: 'Persuasion', religion: 'Religion',
  sleightOfHand: 'Sleight of Hand', stealth: 'Stealth', survival: 'Survival',
}

export const CONDITIONS = [
  'blinded', 'charmed', 'deafened', 'exhaustion', 'frightened', 'grappled',
  'incapacitated', 'invisible', 'paralyzed', 'petrified', 'poisoned', 'prone',
  'restrained', 'stunned', 'unconscious',
  'encumbered', 'heavilyEncumbered', 'blessed', 'concentrating',
]

export const DAMAGE_TYPES = [
  'acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic',
  'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder',
]

export const SIZE_CARRY_MULT = {
  tiny: 0.5, small: 1, medium: 1, large: 2, huge: 4, gargantuan: 8,
}

export function carryCapacity(str, size = 'medium') {
  const mult = SIZE_CARRY_MULT[size] ?? 1
  return (Number.isFinite(str) ? str : 10) * 15 * mult
}

export function encumbranceFor(str, carriedWeight, size = 'medium') {
  const mult = SIZE_CARRY_MULT[size] ?? 1
  const s = Number.isFinite(str) ? str : 10
  const heavy = s * 10 * mult
  const light = s * 5 * mult
  if (carriedWeight > heavy) return { level: 'heavilyEncumbered', speedPenalty: 20 }
  if (carriedWeight > light) return { level: 'encumbered', speedPenalty: 10 }
  return { level: 'none', speedPenalty: 0 }
}

export const XP_FOR_LEVEL = [
  0, 0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
  85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000,
]

export function levelForXp(xp) {
  const x = xp || 0
  for (let lvl = 20; lvl >= 1; lvl--) if (x >= XP_FOR_LEVEL[lvl]) return lvl
  return 1
}

export const ITEM_TYPES = [
  'weapon', 'armor', 'shield', 'consumable', 'potion', 'scroll', 'ammo',
  'ring', 'wondrous', 'tool', 'container', 'treasure', 'currency', 'misc',
]

export const RARITIES = ['common', 'uncommon', 'rare', 'veryRare', 'legendary', 'artifact']

export const RARITY_LABELS = {
  common: 'Common', uncommon: 'Uncommon', rare: 'Rare',
  veryRare: 'Very Rare', legendary: 'Legendary', artifact: 'Artifact',
}

export const EQUIP_SLOTS = [
  'head', 'neck', 'cloak', 'body', 'hands', 'feet',
  'ring1', 'ring2', 'belt', 'eyes',
  'mainHand', 'offHand', 'ranged', 'ammo',
]

export const SLOT_LABELS = {
  head: 'Head', neck: 'Amulet', cloak: 'Cloak', body: 'Armor', hands: 'Gloves',
  feet: 'Boots', ring1: 'Ring', ring2: 'Ring', belt: 'Belt', eyes: 'Eyes',
  mainHand: 'Main Hand', offHand: 'Off Hand', ranged: 'Ranged', ammo: 'Ammo',
}

export const RING_SLOTS = ['ring1', 'ring2']

export const DEFAULT_ATTUNEMENT_MAX = 3

export function slotAcceptsItem(item, targetSlot) {
  if (!item || !item.slot || !targetSlot) return false
  if (item.slot === 'ring') return RING_SLOTS.includes(targetSlot)
  return item.slot === targetSlot
}

export function defaultCharacterAttributes(overrides = {}) {
  return {
    schema: 1,
    biography: { race: '', class: '', subclass: '', level: 1, background: '', alignment: '', size: 'medium', xp: 0 },
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    proficiencyBonus: null,
    hp: { current: 8, max: 8, temp: 0 },
    hitDice: {},
    deathSaves: { successes: 0, failures: 0 },
    exhaustion: 0,
    ac: { base: 10 },
    initiativeBonus: 0,
    speed: { walk: 30, fly: 0, swim: 0, climb: 0, burrow: 0 },
    senses: { darkvision: 0, blindsight: 0, truesight: 0, tremorsense: 0 },
    conditions: [],
    resistances: [], immunities: [], vulnerabilities: [],
    proficiencies: { savingThrows: [], skills: [], weapons: [], armor: [], tools: [], languages: [] },
    skills: {},
    spellcasting: null,
    currency: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
    attunement: { max: DEFAULT_ATTUNEMENT_MAX, itemIds: [] },
    carry: { capacityOverride: null },
    portrait: '',
    tokenDefaults: { width: 100, height: 100, src: '' },
    ...overrides,
  }
}