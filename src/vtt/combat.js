/**
 * combat.js — pure turn-order logic for the tactical layer.
 *
 * The synced combat state is a single record (kind 'combat', id 'combat'):
 *   {
 *     id: 'combat',
 *     sceneId,                  // scene the encounter is on
 *     round,                    // 1-based
 *     turnIndex,                // index into combatants
 *     combatants: [{ tokenId, name, initiative, userId }],
 *   }
 * All functions here are pure: they take state in, return state out.
 * GameActions owns emitting the results as records.
 */

export function rollD20() {
  return 1 + Math.floor(Math.random() * 20)
}

/** Build a sorted combatant list from tokens (highest initiative first). */
export function rollInitiative(tokens, roll = rollD20) {
  return tokens
    .map(t => ({
      tokenId: t.id,
      name: t.name,
      userId: t.userId ?? null,
      initiative: roll(t),
    }))
    .sort((a, b) => b.initiative - a.initiative || a.name.localeCompare(b.name))
}

export function createCombat(sceneId, tokens, roll = rollD20) {
  return {
    id: 'combat',
    sceneId,
    round: 1,
    turnIndex: 0,
    combatants: rollInitiative(tokens, roll),
  }
}

export function activeCombatant(combat) {
  if (!combat?.combatants?.length) return null
  return combat.combatants[combat.turnIndex % combat.combatants.length] ?? null
}

/** Advance one turn; wraps to the next round. */
export function nextTurn(combat) {
  const n = combat.combatants.length
  if (!n) return { turnIndex: 0, round: combat.round }
  const turnIndex = (combat.turnIndex + 1) % n
  const round = turnIndex === 0 ? combat.round + 1 : combat.round
  return { turnIndex, round }
}

/** Step back one turn (DM correction); un-wraps rounds but not below 1. */
export function previousTurn(combat) {
  const n = combat.combatants.length
  if (!n) return { turnIndex: 0, round: combat.round }
  const turnIndex = (combat.turnIndex - 1 + n) % n
  const round = combat.turnIndex === 0 ? Math.max(1, combat.round - 1) : combat.round
  return { turnIndex, round }
}

/** Remove a combatant (token died/left), keeping the active turn stable. */
export function removeCombatant(combat, tokenId) {
  const idx = combat.combatants.findIndex(c => c.tokenId === tokenId)
  if (idx === -1) return combat
  const combatants = combat.combatants.filter(c => c.tokenId !== tokenId)
  let turnIndex = combat.turnIndex
  if (idx < turnIndex) turnIndex -= 1
  if (combatants.length) turnIndex %= combatants.length
  else turnIndex = 0
  return { ...combat, combatants, turnIndex }
}

/** May this user act right now? DM always; owner of the active token on their turn. */
export function canAct(combat, userId, isDm) {
  if (isDm) return true
  const active = activeCombatant(combat)
  return !!active && active.userId === userId
}
