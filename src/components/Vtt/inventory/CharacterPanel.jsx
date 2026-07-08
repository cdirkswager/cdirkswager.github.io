import React from 'react'
import { ABILITIES, ABILITY_LABELS } from '../../../vtt/data/fivee.js'

const sign = (n) => (n >= 0 ? `+${n}` : `${n}`)
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

const DMG_COLOR = {
  fire: '#c0703a', cold: '#5aa9c4', poison: '#5a8a3c', necrotic: '#8a5cc4',
  radiant: '#c9a84c', lightning: '#6fa8d6', acid: '#7fae3a', force: '#b58ad0',
  psychic: '#c46a9a', thunder: '#9a8fd6', bludgeoning: '#9a8f79',
  piercing: '#9a8f79', slashing: '#9a8f79',
}

function TraitList({ title, items, colored }) {
  return (
    <div>
      <h5>{title}</h5>
      {(!items || items.length === 0) && <div className="inv-trait" style={{ color: 'var(--vtt-faint)' }}>—</div>}
      {items?.map((t, i) => (
        <div className="inv-trait" key={i}>
          {colored && <span className="dot" style={{ background: DMG_COLOR[t] || 'var(--vtt-gold-dim)' }} />}
          {cap(t)}
        </div>
      ))}
    </div>
  )
}

export default function CharacterPanel({ selected, derived, paperdoll }) {
  if (!selected) return <div className="inv-empty">Select a character</div>
  const a = selected.attributes || {}
  const bio = a.biography || {}
  const d = derived || {}
  const subtitle = [
    bio.level && bio.class ? `Level ${bio.level} ${cap(bio.class)}${bio.subclass ? ` (${cap(bio.subclass)})` : ''}` : null,
    bio.race || null,
    bio.background || null,
  ].filter(Boolean)

  const senses = d.senses || {}
  const senseItems = [
    senses.darkvision ? `Darkvision ${senses.darkvision}ft` : null,
    senses.blindsight ? `Blindsight ${senses.blindsight}ft` : null,
    senses.truesight ? `Truesight ${senses.truesight}ft` : null,
    senses.passivePerception != null ? `Passive Perception ${senses.passivePerception}` : null,
  ].filter(Boolean)

  const profWeapons = a.proficiencies?.weapons || []
  const profSkills = a.proficiencies?.skills || []
  const profText = [...profWeapons.map(cap), ...profSkills.map(cap)].join(', ') || '—'

  return (
    <>
      <div className="inv-char-name">{selected.name}</div>
      {subtitle.length > 0 && (
        <div className="inv-char-sub">{subtitle.map((s, i) => <div key={i}>{s}</div>)}</div>
      )}

      {paperdoll}

      {/* combat row */}
      <div className="inv-combat" style={{ marginTop: 14 }}>
        <div>
          <div className="inv-atk"><b>Melee</b> {sign((d.mods?.str ?? 0) + (d.proficiencyBonus ?? 0))}</div>
          <div className="inv-atk"><b>Ranged</b> {sign((d.mods?.dex ?? 0) + (d.proficiencyBonus ?? 0))}</div>
          <div className="inv-atk"><b>Initiative</b> {sign(d.initiative ?? 0)}</div>
        </div>
        <div className="inv-ac">
          <div>
            <div className="t">AC</div>
            <div className="n">{d.ac ?? '—'}</div>
          </div>
        </div>
        <div className="col">
          <div className="lab">Movement</div>
          <div className="val">{d.speed?.walk ?? a.speed?.walk ?? 30} ft</div>
          <div className="lab" style={{ marginTop: 6 }}>Prof</div>
          <div className="val">{sign(d.proficiencyBonus ?? 2)}</div>
        </div>
      </div>

      {/* abilities */}
      <div className="inv-abils">
        {ABILITIES.map(ab => (
          <div className="inv-abil" key={ab} title={ABILITY_LABELS[ab]}>
            <div className="k">{ab.toUpperCase()}</div>
            <div className="v">{d.abilities?.[ab] ?? a.abilities?.[ab] ?? 10}</div>
            <div className="m">{sign(d.mods?.[ab] ?? 0)}</div>
          </div>
        ))}
      </div>

      {/* traits */}
      <div className="inv-traits">
        <TraitList title="Resistances" items={d.resistances || a.resistances} colored />
        <TraitList title="Conditions" items={d.conditions || a.conditions} />
        <div>
          <h5>Senses</h5>
          {senseItems.length === 0 && <div className="inv-trait" style={{ color: 'var(--vtt-faint)' }}>—</div>}
          {senseItems.map((s, i) => <div className="inv-trait" key={i}>{s}</div>)}
        </div>
      </div>

      <div className="inv-profs">
        <h5>Proficiencies</h5>
        <p>{profText}</p>
      </div>
    </>
  )
}
