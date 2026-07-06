const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha']

const SKILLS = [
  'acrobatics', 'animalHandling', 'arcana', 'athletics', 'deception',
  'history', 'insight', 'intimidation', 'investigation', 'medicine',
  'nature', 'perception', 'performance', 'persuasion', 'religion',
  'sleightOfHand', 'stealth', 'survival',
]

export function computeDerivedStats(stats) {
  const mod = (score) => Math.floor((score - 10) / 2)
  const p = (score, proficient) => mod(score) + (proficient ? stats.proficiencyBonus : 0)
  const e = (score, prof) => p(score, prof) + (prof ? stats.proficiencyBonus : 0)

  const s = { ...stats }

  for (const ab of ABILITIES) {
    s[ab + 'Save'] = e(s[ab], (stats.saveProficiencies || []).includes(ab))
  }

  for (const skill of SKILLS) {
    const abilityMap = {
      acrobatics: 'dex', animalHandling: 'wis', arcana: 'int',
      athletics: 'str', deception: 'cha', history: 'int',
      insight: 'wis', intimidation: 'cha', investigation: 'int',
      medicine: 'wis', nature: 'int', perception: 'wis',
      performance: 'cha', persuasion: 'cha', religion: 'int',
      sleightOfHand: 'dex', stealth: 'dex', survival: 'wis',
    }
    const ab = abilityMap[skill]
    const prof = (stats.skillProficiencies || []).includes(skill)
    const expert = (stats.expertise || []).includes(skill)
    s[skill] = expert ? e(s[ab], prof) : p(s[ab], prof)
  }

  return s
}

export class Actor {
  constructor({
    id, name, img, actorType, ownership, attributes,
    stats, health, conditions, equipment, inventory,
  } = {}) {
    this.id = id ?? crypto.randomUUID()
    this.name = name ?? 'New Actor'
    this.img = img ?? ''
    this.actorType = actorType ?? 'character'
    this.ownership = ownership ?? { default: 'none', users: {} }
    this.attributes = attributes ?? {}

    this.stats = this._initStats(stats)
    this.health = this._initHealth(health)
    this.conditions = conditions ?? []
    this.equipment = this._initEquipment(equipment)
    this.inventory = this._initInventory(inventory)
  }

  _initStats(stats) {
    const base = {
      str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10,
      proficiencyBonus: 2, baseAC: 10,
      saveProficiencies: [], skillProficiencies: [], expertise: [],
      strSave: 0, dexSave: 0, conSave: 0, intSave: 0, wisSave: 0, chaSave: 0,
      acrobatics: 0, animalHandling: 0, arcana: 0, athletics: 0, deception: 0,
      history: 0, insight: 0, intimidation: 0, investigation: 0, medicine: 0,
      nature: 0, perception: 0, performance: 0, persuasion: 0, religion: 0,
      sleightOfHand: 0, stealth: 0, survival: 0,
    }
    const merged = { ...base, ...(stats || {}) }
    return computeDerivedStats(merged)
  }

  _initHealth(h) {
    return {
      maxHp: 10, currentHp: 10, tempHp: 0,
      deathSaves: { successes: 0, failures: 0 },
      hitDice: { d6: 2, d8: 0, d10: 0, d12: 0 },
      ...(h || {}),
    }
  }

  _initEquipment(eq) {
    const slots = {
      head: null, neck: null, shoulders: null, chest: null,
      hands: null, ring1: null, ring2: null,
      mainHand: null, offHand: null, feet: null,
    }
    return { ...slots, ...(eq || {}) }
  }

  _initInventory(inv) {
    return {
      maxWeight: 150,
      currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
      ...(inv || {}),
    }
  }

  recalcStats() {
    this.stats = computeDerivedStats(this.stats)
  }

  toJSON() {
    return {
      type: 'actor',
      id: this.id,
      name: this.name,
      img: this.img,
      actorType: this.actorType,
      ownership: this.ownership,
      attributes: this.attributes,
      stats: this.stats,
      health: this.health,
      conditions: this.conditions,
      equipment: this.equipment,
      inventory: this.inventory,
    }
  }
}
