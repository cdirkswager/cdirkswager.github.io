/**
 * Effect Engine — pure function to compute stat deltas from equipped items.
 *
 * Called when:
 *   - An item is equipped or unequipped
 *   - A condition is added or removed
 *
 * Returns a diff object that can be applied to actor.stats and actor.health.
 */

const EFFECT_HANDLERS = {
  statBonus(state, effect) {
    if (effect.target && state.stats[effect.target] !== undefined) {
      state.stats[effect.target] += effect.value
    }
  },

  saveBonus(state, effect) {
    const key = effect.target + 'Save'
    if (state.stats[key] !== undefined) {
      state.stats[key] += effect.value
    }
  },

  skillBonus(state, effect) {
    if (state.stats[effect.target] !== undefined) {
      state.stats[effect.target] += effect.value
    }
  },

  acBonus(state, effect) {
    if (state.stats.baseAC !== undefined) {
      state.stats.baseAC += effect.value
    }
  },

  maxHpBonus(state, effect) {
    if (state.health.maxHp !== undefined) {
      state.health.maxHp += effect.value
    }
  },
}

export function computeStatDeltas(actor, equippedItems) {
  const state = {
    stats: { ...actor.stats },
    health: { ...actor.health },
  }

  for (const item of equippedItems) {
    if (!item.effects || !Array.isArray(item.effects)) continue
    for (const effect of item.effects) {
      if (effect.condition !== 'equipped') continue
      const handler = EFFECT_HANDLERS[effect.type]
      if (handler) handler(state, effect)
    }
  }

  const statChanges = {}
  for (const key of Object.keys(state.stats)) {
    if (state.stats[key] !== actor.stats[key]) {
      statChanges[key] = state.stats[key]
    }
  }

  const healthChanges = {}
  for (const key of Object.keys(state.health)) {
    if (state.health[key] !== actor.health[key]) {
      healthChanges[key] = state.health[key]
    }
  }

  return { statChanges, healthChanges }
}
