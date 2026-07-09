import { useState, useEffect } from 'react'
import { activeCombatant } from '../../../vtt/combat.js'

/**
 * CombatTracker — the tactical turn bar (top center).
 * Renders initiative order from the synced combat record; DM controls
 * turn flow. Everyone sees the same order and active combatant.
 */
export default function CombatTracker({ canvas, actions, eventBus, isDm }) {
  const [combat, setCombat] = useState(canvas?.world?.combat ?? null)

  useEffect(() => {
    if (!eventBus) return
    const unsub = eventBus.on('combat-changed', (c) => setCombat(c ? { ...c } : null))
    return unsub
  }, [eventBus])

  /* Space advances the turn (DM only, and only outside inputs). */
  useEffect(() => {
    if (!isDm) return
    const onKey = (e) => {
      if (e.code !== 'Space' || !combat) return
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return
      e.preventDefault()
      actions?.advanceTurn()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isDm, combat, actions])

  if (!combat) {
    return isDm ? (
      <div className="combat-tracker combat-tracker--idle">
        <button className="combat-btn combat-btn--start" onClick={() => actions?.startCombat()}>
          ⚔ Start Combat
        </button>
      </div>
    ) : null
  }

  const active = activeCombatant(combat)

  return (
    <div className="combat-tracker">
      <div className="combat-round">Round {combat.round}</div>
      <div className="combat-order">
        {combat.combatants.map((c, i) => (
          <div
            key={c.tokenId}
            className={`combatant ${c.tokenId === active?.tokenId ? 'combatant--active' : ''}`}
            title={`${c.name} — initiative ${c.initiative}`}
            onClick={() => eventBus?.emit('token-selected', { tokenId: c.tokenId })}
          >
            <span className="combatant-init">{c.initiative}</span>
            <span className="combatant-name">{c.name}</span>
          </div>
        ))}
      </div>
      {isDm && (
        <div className="combat-controls">
          <button className="combat-btn" onClick={() => actions?.rewindTurn()} title="Previous turn">◀</button>
          <button className="combat-btn combat-btn--next" onClick={() => actions?.advanceTurn()} title="Next turn (Space)">
            Next ▶
          </button>
          <button className="combat-btn combat-btn--end" onClick={() => actions?.endCombat()} title="End combat">✕</button>
        </div>
      )}
    </div>
  )
}
