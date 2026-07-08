import {
  ABILITIES, abilityMod, proficiencyBonusForLevel, SKILLS,
} from './fivee.js'
import { carrySummary } from './weight.js'

export function activeItems(items) {
  return (items || []).filter(it => {
    if (!it.equipped) return false
    if (it.attunement?.required && !it.attunement?.attuned) return false
    return true
  })
}

function collectEffects(items) {
  const out = []
  for (const it of activeItems(items)) {
    for (const eff of it.effects || []) {
      out.push({ ...eff, _from: it.id })
    }
  }
  return out
}

function applyNumeric(base, effects, target) {
  let overridden = null
  let add = 0
  let mult = 1
  let maxFloor = null
  let minCeil = null
  for (const e of effects) {
    if (e.target !== target) continue
    const v = Number(e.value)
    if (!Number.isFinite(v)) continue
    switch (e.mode) {
      case 'override': overridden = v; break
      case 'add': add += v; break
      case 'mult': mult *= v; break
      case 'max': maxFloor = maxFloor == null ? v : Math.max(maxFloor, v); break
      case 'min': minCeil = minCeil == null ? v : Math.min(minCeil, v); break
    }
  }
  let val = overridden != null ? overridden : base
  val = (val + add) * mult
  if (maxFloor != null) val = Math.max(val, maxFloor)
  if (minCeil != null) val = Math.min(val, minCeil)
  return val
}

function applyGrants(baseArr, effects, target) {
  const set = new Set(baseArr || [])
  for (const e of effects) {
    if (e.target === target && e.mode === 'grant' && e.value != null) set.add(e.value)
  }
  return [...set]
}

function findArmor(items) {
  const active = activeItems(items)
  const body = active.find(i => i.itemType === 'armor' && (i.slot === 'body' || !i.slot) && i.armor)
  const shield = active.find(i => i.itemType === 'shield' && i.armor)
  return { body, shield }
}

export function computeDerived(actor, items = []) {
  const attrs = actor?.attributes ?? {}
  const effects = collectEffects(items)

  const baseAbilities = attrs.abilities ?? {}
  const abilities = {}
  const mods = {}
  for (const ab of ABILITIES) {
    const base = baseAbilities[ab] ?? 10
    abilities[ab] = Math.floor(applyNumeric(base, effects, `abilities.${ab}`))
    mods[ab] = abilityMod(abilities[ab])
  }

  const level = attrs.biography?.level ?? 1
  const baseProf = attrs.proficiencyBonus ?? proficiencyBonusForLevel(level)
  const proficiencyBonus = Math.floor(applyNumeric(baseProf, effects, 'proficiencyBonus'))

  const { body, shield } = findArmor(items)
  let ac
  if (body) {
    const cap = body.armor.dexCap
    const dexContribution = cap == null ? mods.dex : Math.min(mods.dex, cap)
    ac = (Number(body.armor.baseAC) || 10) + dexContribution
  } else {
    ac = (attrs.ac?.base ?? 10) + mods.dex
  }
  if (shield) ac += Number(shield.armor.baseAC) || 0
  ac = Math.floor(applyNumeric(ac, effects, 'ac'))

  const initiative = Math.floor(
    applyNumeric(mods.dex + (attrs.initiativeBonus ?? 0), effects, 'initiative')
  )

  const baseSpeed = attrs.speed ?? { walk: 30 }
  const speed = {}
  for (const k of ['walk', 'fly', 'swim', 'climb', 'burrow']) {
    speed[k] = Math.max(0, Math.floor(applyNumeric(baseSpeed[k] ?? 0, effects, `speed.${k}`)))
  }

  const carry = carrySummary(attrs, items)
  if (carry.speedPenalty) speed.walk = Math.max(0, speed.walk - carry.speedPenalty)

  const baseSenses = attrs.senses ?? {}
  const senses = {}
  for (const k of ['darkvision', 'blindsight', 'truesight', 'tremorsense']) {
    senses[k] = Math.floor(applyNumeric(baseSenses[k] ?? 0, effects, `senses.${k}`))
  }

  const percTier = attrs.skills?.perception
  const percBonus = percTier === 'expertise' ? proficiencyBonus * 2
    : percTier === 'proficient' || (attrs.proficiencies?.skills || []).includes('perception') ? proficiencyBonus
    : 0
  const passivePerception = Math.floor(
    applyNumeric(10 + mods.wis + percBonus, effects, 'passivePerception')
  )
  senses.passivePerception = passivePerception

  const hpMax = Math.floor(applyNumeric(attrs.hp?.max ?? 0, effects, 'hp.max'))

  const resistances = applyGrants(attrs.resistances, effects, 'resistances')
  const immunities = applyGrants(attrs.immunities, effects, 'immunities')
  const vulnerabilities = applyGrants(attrs.vulnerabilities, effects, 'vulnerabilities')
  const grantedConditions = applyGrants(attrs.conditions, effects, 'conditions')

  const conditions = [...new Set([
    ...grantedConditions,
    ...(carry.encumbrance === 'encumbered' ? ['encumbered'] : []),
    ...(carry.encumbrance === 'heavilyEncumbered' ? ['heavilyEncumbered'] : []),
  ])]

  const skills = {}
  for (const [skill, ability] of Object.entries(SKILLS)) {
    const tier = attrs.skills?.[skill] || ((attrs.proficiencies?.skills || []).includes(skill) ? 'proficient' : null)
    const bonus = tier === 'expertise' ? proficiencyBonus * 2 : tier === 'proficient' ? proficiencyBonus : 0
    skills[skill] = mods[ability] + bonus
  }

  const saves = {}
  for (const ab of ABILITIES) {
    const prof = (attrs.proficiencies?.savingThrows || []).includes(ab)
    saves[ab] = mods[ab] + (prof ? proficiencyBonus : 0)
  }

  return {
    abilities, mods, proficiencyBonus,
    ac, initiative, speed, senses, passivePerception,
    hp: { ...(attrs.hp ?? { current: 0, temp: 0 }), max: hpMax },
    resistances, immunities, vulnerabilities, conditions,
    skills, saves,
    carry,
    attunement: {
      max: attrs.attunement?.max ?? 3,
      used: (items || []).filter(i => i.attunement?.attuned).length,
    },
  }
}