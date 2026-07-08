import React from 'react'
import { Droppable } from './dnd.jsx'

function HpBar({ hp }) {
  const max = hp?.max || 1
  const cur = Math.max(0, Math.min(hp?.current ?? 0, max))
  const temp = Math.max(0, hp?.temp ?? 0)
  const curPct = (cur / max) * 100
  const tempPct = Math.min(100 - curPct, (temp / max) * 100)
  return (
    <div className="inv-hpbar" title={`${cur}/${max}${temp ? ` (+${temp})` : ''}`}>
      <i style={{ width: `${curPct}%` }} />
      {temp > 0 && <u style={{ left: `${curPct}%`, width: `${tempPct}%` }} />}
    </div>
  )
}

function Portrait({ actor, selected, owned, onSelect }) {
  const hp = actor.attributes?.hp
  const initial = (actor.name || '?').trim().charAt(0).toUpperCase()
  return (
    <Droppable id={`party:${actor.id}`} data={{ actorId: actor.id }}>
      <div
        className={`inv-portrait${selected ? ' selected' : ''}`}
        onClick={() => onSelect(actor.id)}
        role="button" tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(actor.id)}
        title={owned ? actor.name : `${actor.name} — viewing shared stash`}
      >
        <div className="inv-portrait-ring">
          {actor.img || actor.attributes?.portrait
            ? <img src={actor.attributes?.portrait || actor.img} alt={actor.name} />
            : <div className="inv-portrait-fallback">{initial}</div>}
        </div>
        {hp && <HpBar hp={hp} />}
        {hp && <div className="inv-hptext">{hp.current ?? 0}/{hp.max ?? 0}</div>}
        {!owned && <div className="inv-lock">shared</div>}
      </div>
    </Droppable>
  )
}

export default function PartyRail({ party, selectedId, owns, accessOf, onSelect }) {
  return (
    <div className="inv-rail">
      {party.length === 0 && <div className="inv-empty">No characters</div>}
      {party.map(a => (
        <Portrait
          key={a.id}
          actor={a}
          selected={a.id === selectedId}
          owned={accessOf(a) === 'owner'}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}
