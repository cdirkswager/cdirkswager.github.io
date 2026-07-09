import { useState, useEffect } from 'react'

/**
 * UnitPanel — the selected-unit card (bottom left), tactics-game style:
 * portrait, name, HP bar with quick damage/heal, speed. DM can edit
 * max HP and speed inline; owners and the DM can adjust current HP.
 */
export default function UnitPanel({ canvas, actions, eventBus, session, isDm }) {
  const [tokenId, setTokenId] = useState(null)
  const [, force] = useState(0)

  useEffect(() => {
    if (!eventBus) return
    const unsubs = [
      eventBus.on('token-selected', ({ tokenId: id }) => setTokenId(id)),
      /* Re-render when the selected token's record changes (HP sync). */
      eventBus.on('world:effect', (e) => {
        if (e.kind === 'token') force(n => n + 1)
      }),
      eventBus.on('world:view-scene', () => setTokenId(null)),
    ]
    return () => unsubs.forEach(u => u())
  }, [eventBus])

  /* Esc deselects. */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') eventBus?.emit('token-selected', { tokenId: null })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [eventBus])

  const token = tokenId ? canvas?.world?.findToken(tokenId)?.token : null
  if (!token) return null

  const canEdit = isDm || token.userId === session?.userId
  const hasHp = token.maxHp > 0
  const hp = hasHp ? Math.max(0, Math.min(token.hp ?? token.maxHp, token.maxHp)) : 0
  const pct = hasHp ? (hp / token.maxHp) * 100 : 0
  const hpClass = pct > 50 ? 'ok' : pct > 25 ? 'warn' : 'danger'

  return (
    <div className="unit-panel">
      <div className="unit-portrait">
        {token.src
          ? <img src={token.src} alt={token.name} />
          : <div className="unit-portrait-fallback">{(token.name ?? '?')[0]}</div>}
      </div>
      <div className="unit-body">
        <div className="unit-name">{token.name}</div>
        {hasHp ? (
          <>
            <div className="unit-hpbar">
              <div className={`unit-hpfill unit-hpfill--${hpClass}`} style={{ width: `${pct}%` }} />
              <span className="unit-hptext">{hp} / {token.maxHp}</span>
            </div>
            {canEdit && (
              <div className="unit-hp-controls">
                <button onClick={() => actions?.adjustTokenHp(token.id, -5)}>−5</button>
                <button onClick={() => actions?.adjustTokenHp(token.id, -1)}>−1</button>
                <button onClick={() => actions?.adjustTokenHp(token.id, +1)}>+1</button>
                <button onClick={() => actions?.adjustTokenHp(token.id, +5)}>+5</button>
              </div>
            )}
          </>
        ) : (
          isDm && (
            <button
              className="unit-set-hp"
              onClick={() => {
                const v = Number(window.prompt('Max HP for ' + token.name + ':', '20'))
                if (v > 0) actions?.setTokenStats(token.id, { maxHp: v, hp: v })
              }}
            >
              Set HP…
            </button>
          )
        )}
        <div className="unit-meta">
          <span title="Movement speed">🏃 {token.speed ?? 30} {canvas?.scene?.gridUnitLabel || 'ft'}</span>
          {isDm && (
            <button
              className="unit-speed-edit"
              onClick={() => {
                const v = Number(window.prompt('Speed for ' + token.name + ':', String(token.speed ?? 30)))
                if (v >= 0) actions?.setTokenStats(token.id, { speed: v })
              }}
            >✎</button>
          )}
        </div>
      </div>
    </div>
  )
}
