import React, { useState, useEffect, useMemo } from 'react'
import { getAccessLevel } from '../../../vtt/canvas/ownership.js'
import { computeDerived } from '../../../vtt/data/EffectEngine.js'
import { IconUser, IconClose } from './icons.jsx'

function HpBar({ hp }) {
  const max = hp?.max || 1
  const cur = Math.max(0, Math.min(hp?.current ?? 0, max))
  const temp = Math.max(0, hp?.temp ?? 0)
  const curPct = (cur / max) * 100
  const tempPct = Math.min(100 - curPct, (temp / max) * 100)
  return (
    <div className="inv-hpbar" style={{ width: '100%' }}>
      <i style={{ width: `${curPct}%` }} />
      {temp > 0 && <u style={{ left: `${curPct}%`, width: `${tempPct}%` }} />}
    </div>
  )
}

export default function PartyPanel({ controller, eventBus, session, onSelect, onClose }) {
  const [, bump] = useState(0)
  useEffect(() => {
    if (!eventBus) return
    const f = () => bump(v => v + 1)
    const a = eventBus.on('actors-changed', f)
    const b = eventBus.on('items-changed', f)
    return () => { a?.(); b?.() }
  }, [eventBus])

  const user = { userId: session?.userId, role: session?.role }
  const isDm = session?.role === 'dm'

  const members = useMemo(() => {
    const actors = [...(controller?.actorMap?.values() || [])]
    const items = [...(controller?.itemMap?.values() || [])]
    return actors
      .filter(a => a.actorType === 'character' || (isDm && a.actorType === 'npc'))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      .map(a => {
        const own = getAccessLevel(user, a) === 'owner'
        const derived = computeDerived(a, items.filter(i => i.actorId === a.id))
        return { actor: a, own, derived }
      })
  }, [controller, user, isDm])

  return (
    <div className="inv-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.() }}>
      <div className="party-frame" role="dialog" aria-label="Party">
        <div className="inv-topbar">
          <IconUser /><span className="loot-heading">Party</span>
          <div className="inv-topbar-spacer" />
          <button className="inv-iconbtn inv-close" title="Close (Esc)" onClick={onClose}><IconClose /></button>
        </div>
        <div className="party-grid">
          {members.length === 0 && <div className="inv-empty">No characters</div>}
          {members.map(({ actor, own, derived }) => {
            const a = actor.attributes || {}
            const bio = a.biography || {}
            const initial = (actor.name || '?').charAt(0).toUpperCase()
            const conditions = derived?.conditions || a.conditions || []
            return (
              <button key={actor.id} className={`party-card${own ? ' own' : ''}`}
                onClick={() => onSelect?.(actor.id)} title={`Open ${actor.name}'s sheet`}>
                <div className="party-card-top">
                  <div className="party-portrait">
                    {actor.img || a.portrait
                      ? <img src={a.portrait || actor.img} alt={actor.name} />
                      : <span>{initial}</span>}
                  </div>
                  <div className="party-id">
                    <div className="party-name">{actor.name}{!own && <em> · shared</em>}</div>
                    <div className="party-sub">
                      {bio.level ? `Lv ${bio.level} ` : ''}{bio.class || (actor.actorType === 'npc' ? 'NPC' : '')}
                    </div>
                  </div>
                  <div className="party-ac" title="Armor Class"><span>{derived?.ac ?? a.ac?.base ?? '—'}</span>AC</div>
                </div>
                <div className="party-hp">
                  <HpBar hp={a.hp} />
                  <span>{a.hp?.current ?? 0}/{a.hp?.max ?? 0}{a.hp?.temp ? ` (+${a.hp.temp})` : ''}</span>
                </div>
                {conditions.length > 0 && (
                  <div className="party-conds">
                    {conditions.slice(0, 6).map(c => <span key={c} className="party-cond">{c}</span>)}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
