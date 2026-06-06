import { useState, useEffect, useCallback } from "react"
import { api } from "../../lib/dnd/api"

const COLOR = {
  ok: "var(--ok)", warn: "var(--warn)", risk: "var(--risk)", crit: "var(--crit)",
}

function riskFromOverall(pct) {
  if (pct > 75) return { label: "Well Rested", color: "ok" }
  if (pct > 50) return { label: "Engaged", color: "warn" }
  if (pct > 25) return { label: "Tested", color: "risk" }
  return { label: "Critical", color: "crit" }
}

export function PartyGauge() {
  const [open, setOpen] = useState(false)
  const [players, setPlayers] = useState([])
  const [combatData, setCombatData] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [resting, setResting] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const [pData, cData] = await Promise.allSettled([
        api.get('/api/dnd/players'),
        api.get('/api/dnd/combat'),
      ])
      if (pData.status === 'fulfilled') setPlayers(pData.value.players || [])
      if (cData.status === 'fulfilled') {
        setCombatData(cData.value.session ? cData.value : null)
      }
    } catch {}
  }, [])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => {
    const hpHandler = (e) => {
      const { playerId, current_hp } = e.detail
      setPlayers((prev) =>
        prev.map((p) => (p.id === playerId ? { ...p, current_hp } : p))
      )
    }
    window.addEventListener('dnd-player-hp-changed', hpHandler)
    return () => window.removeEventListener('dnd-player-hp-changed', hpHandler)
  }, [])

  const hpEntries = players.map((p) => ({
    playerName: p.name, playerId: p.id,
    max_value: p.max_hp || 0,
    current_value: p.current_hp ?? p.max_hp ?? 0,
  }))
  const allResources = [
    ...hpEntries,
    ...players.flatMap(
      (p) => (p.resources || []).map((r) => ({ ...r, playerName: p.name, playerId: p.id }))
    ),
  ]
  const totalMax = allResources.reduce((s, r) => s + (r.max_value || 0), 0)
  const totalCur = allResources.reduce((s, r) => s + (r.current_value ?? 0), 0)
  const overallPct = totalMax > 0 ? Math.round((totalCur / totalMax) * 100) : 100

  const lowHpPlayers = players.filter((p) => {
    const cur = p.current_hp ?? p.max_hp ?? 0; const max = p.max_hp || 1
    return (cur / max) <= 0.5
  })
  const depletedCount = players.reduce((c, p) => c + (p.resources || []).filter((r) => (r.current_value ?? 0) === 0).length, 0)
  const totalResCount = players.reduce((c, p) => c + (p.resources || []).length, 0)
  let readinessLabel, readinessColor
  if (overallPct >= 90) { readinessLabel = 'Full strength'; readinessColor = 'var(--ok)' }
  else if (overallPct >= 70) { readinessLabel = 'Lightly tapped'; readinessColor = 'var(--ok)' }
  else if (overallPct >= 50) { readinessLabel = 'Moderately spent'; readinessColor = 'var(--warn)' }
  else if (overallPct >= 30) { readinessLabel = 'Heavily depleted'; readinessColor = 'var(--risk)' }
  else { readinessLabel = 'Critically low'; readinessColor = 'var(--crit)' }
  const readinessDetail = []
  if (lowHpPlayers.length > 0) readinessDetail.push(`${lowHpPlayers.length} bloodied`)
  if (depletedCount > 0) readinessDetail.push(`${depletedCount}/${totalResCount} resources spent`)

  const hasCombat = !!combatData?.session
  const encounter = riskFromOverall(overallPct)
  const gaugeColor = COLOR[encounter.color] ?? "var(--dim)"
  const gaugeLabel = encounter.label
  const bannerColor = hasCombat ? gaugeColor : readinessColor
  const bannerLabel = hasCombat ? gaugeLabel : readinessLabel

  const handleHpChange = async (playerId, newHp) => {
    const clamped = Math.max(0, newHp)
    setPlayers((prev) =>
      prev.map((p) => (p.id === playerId ? { ...p, current_hp: clamped } : p))
    )
    await api.patch('/api/dnd/players', { id: playerId, current_hp: clamped })
    window.dispatchEvent(new CustomEvent('dnd-player-hp-changed', {
      detail: { playerId, current_hp: clamped }
    }))
  }

  const updateResource = async (playerId, resourceId, field, value) => {
    setPlayers((prev) =>
      prev.map((p) =>
        p.id === playerId
          ? { ...p, resources: (p.resources || []).map((r) => (r.id === resourceId ? { ...r, [field]: value } : r)) }
          : p
      )
    )
    await api.patch('/api/dnd/players/resources', { id: resourceId, [field]: value })
    window.dispatchEvent(new Event('dnd-combatants-changed'))
  }

  const restAll = async (type) => {
    setResting(true)
    const targets = players.flatMap((p) =>
      (p.resources || []).filter((r) => type === 'long' || r.recovery_type === 'short_rest')
    )
    for (const r of targets) {
      await api.patch('/api/dnd/players/resources', { id: r.id, current_value: r.max_value })
    }
    for (const p of players) {
      const hp = type === 'long'
        ? p.max_hp
        : Math.min(p.max_hp, (p.current_hp ?? p.max_hp) + Math.ceil(p.max_hp / 4))
      await api.patch('/api/dnd/players', { id: p.id, current_hp: hp })
    }
    setPlayers((prev) =>
      prev.map((p) => ({
        ...p,
        resources: (p.resources || []).map((r) =>
          type === 'long' || r.recovery_type === 'short_rest'
            ? { ...r, current_value: r.max_value }
            : r
        ),
        current_hp: type === 'long'
          ? p.max_hp
          : Math.min(p.max_hp, (p.current_hp ?? p.max_hp) + Math.ceil(p.max_hp / 4)),
      }))
    )
    setResting(false)
    window.dispatchEvent(new Event('dnd-resources-changed'))
    window.dispatchEvent(new Event('dnd-combatants-changed'))
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-30">
      {open && (
        <div className="mx-auto max-w-[1400px] px-4">
          <div className="fadeup rounded-t-lg border border-b-0 border-line bg-panel shadow-2xl">
            {players.length > 0 && (
              <div className="border-b border-line px-4 py-2.5">
                <div className="flex items-baseline gap-6 text-xs">
                  <div>
                    <span className="text-[10px] font-medium uppercase tracking-wide text-dim">Readiness</span>
                    <p className="mt-0.5" style={{ color: readinessColor }}>
                      {readinessLabel}
                      {readinessDetail.length > 0 && <span className="text-dim"> · {readinessDetail.join(' · ')}</span>}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] font-medium uppercase tracking-wide text-dim">Encounter</span>
                    {hasCombat ? (
                      <p className="mt-0.5" style={{ color: gaugeColor }}>{gaugeLabel ?? 'Active'}</p>
                    ) : (
                      <p className="mt-0.5 text-dim">No active encounter</p>
                    )}
                  </div>
                </div>
              </div>
            )}
            <div className="max-h-80 overflow-y-auto p-2">
              {players.length === 0 && (
                <p className="py-6 text-center text-xs text-dim">No party members. Add them in the Party tab.</p>
              )}
              {players.map((p) => {
                const expanded = expandedId === p.id
                const res = p.resources || []
                const others = res.filter(r => r.resource_type !== 'spell_slot')
                const slots = res.filter(r => r.resource_type === 'spell_slot')
                const hpCur = p.current_hp ?? p.max_hp ?? 0
                const hpMax = p.max_hp || 0
                const hpPct = hpMax > 0 ? (hpCur / hpMax) * 100 : 0
                const hpColor = hpPct > 50 ? 'var(--ok)' : hpPct > 25 ? 'var(--warn)' : 'var(--crit)'
                return (
                  <div key={p.id} className="mb-1 rounded border border-line bg-ink">
                    <div
                      className="flex cursor-pointer items-center gap-2 px-2.5 py-1.5"
                      onClick={() => setExpandedId(expanded ? null : p.id)}
                    >
                      <span className="flex-1 truncate text-sm font-medium text-player">{p.name}</span>
                      {p.is_active && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-player" />}

                      <div className="relative w-20 shrink-0 sm:w-28" onClick={(e) => e.stopPropagation()}>
                        <div className="flex h-8 items-center">
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink">
                            <div className="gauge-fill h-full rounded-full pointer-events-none" style={{ width: `${Math.max(0, hpPct)}%`, background: hpColor }} />
                          </div>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max={hpMax}
                          step="1"
                          value={hpCur}
                          onChange={(e) => handleHpChange(p.id, Math.min(hpMax, parseInt(e.target.value) || 0))}
                          className="absolute inset-0 cursor-col-resize opacity-0"
                        />
                      </div>
                      <span className="mono shrink-0 text-xs text-dim">{hpCur}/{hpMax}</span>

                      <span className="mono shrink-0 text-xs text-dim">{expanded ? '▴' : '▾'}</span>
                    </div>
                    {expanded && (
                      <div className="border-t border-line px-2 pb-2 pt-1">
                        {res.length === 0 && (
                          <p className="py-2 text-center text-[10px] text-dim">No resources.</p>
                        )}
                        {others.map((r) => (
                          <ResourceControl
                            key={r.id}
                            resource={r}
                            onChange={(field, value) => updateResource(p.id, r.id, field, value)}
                          />
                        ))}
                        {slots.length > 0 && (
                          <AggregateSpellSlots
                            slots={slots}
                            playerId={p.id}
                            onChange={updateResource}
                          />
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full border-t border-line bg-panel/95 backdrop-blur"
        style={{ boxShadow: `inset 0 2px 0 0 ${bannerColor}` }}
      >
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: bannerColor, boxShadow: `0 0 8px ${bannerColor}` }} />
          <span className="display shrink-0 text-sm font-bold uppercase tracking-wide" style={{ color: bannerColor }}>
            {bannerLabel}
          </span>
          <div className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-ink sm:w-36">
            <div className="gauge-fill h-full rounded-full" style={{ width: `${overallPct}%`, background: bannerColor }} />
          </div>
          <span className="mono shrink-0 text-sm font-bold" style={{ color: bannerColor }}>{overallPct}%</span>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={(e) => { e.stopPropagation(); restAll('short') }}
              disabled={resting}
              className="rounded border border-line bg-ink px-2.5 py-1 text-[10px] font-medium text-dim hover:border-warn hover:text-warn disabled:opacity-40"
            >
              Short Rest
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); restAll('long') }}
              disabled={resting}
              className="rounded border border-line bg-ink px-2.5 py-1 text-[10px] font-medium text-dim hover:border-ok hover:text-ok disabled:opacity-40"
            >
              Long Rest
            </button>
          </div>

          <span className="shrink-0 text-xs text-dim">{open ? "▾" : "▴"}</span>
        </div>
      </button>
    </div>
  )
}

function ResourceControl({ resource: r, onChange }) {
  const max = r.max_value || 0
  const cur = Math.min(r.current_value ?? 0, max)

  if (r.resource_type === 'spell_slot') return null

  if (max <= 2) {
    return (
      <div className="mb-1 flex items-center gap-2 rounded border border-line bg-panel px-2 py-1">
        <span className="w-24 truncate text-[11px] text-dim">{r.name}</span>
        <div className="flex gap-0.5">
          {Array.from({ length: max }, (_, i) => {
            const clicked = i + 1
            return (
              <button
                key={i}
                onClick={() => onChange('current_value', clicked === cur ? 0 : clicked)}
                className={`h-4 w-4 rounded-full border transition-colors ${
                  i < cur ? 'border-accent bg-accent' : 'border-line hover:border-accent'
                }`}
              />
            )
          })}
        </div>
        <span className="mono text-[10px] text-dim">({cur}/{max})</span>
        {r.recovery_type === 'short_rest' && <span className="mono text-[9px] text-warn">SR</span>}
      </div>
    )
  }

  return (
    <div className="mb-1 flex items-center gap-2 rounded border border-line bg-panel px-2 py-1">
      <span className="w-24 truncate text-[11px] text-dim">{r.name}</span>
      <input
        type="range"
        min="0"
        max={max}
        step="1"
        value={cur}
        onChange={(e) => onChange('current_value', parseInt(e.target.value) || 0)}
        className="flex-1 accent-accent"
      />
      <input
        type="number"
        min="0"
        max={max}
        className="mono w-10 rounded border border-line bg-ink px-1 py-0.5 text-center text-[10px]"
        value={cur}
        onChange={(e) => onChange('current_value', Math.max(0, Math.min(max, parseInt(e.target.value) || 0)))}
      />
      <span className="mono text-[10px] text-dim">/{max}</span>
      {r.recovery_type === 'short_rest' && <span className="mono text-[9px] text-warn">SR</span>}
    </div>
  )
}

function AggregateSpellSlots({ slots, playerId, onChange }) {
  const sorted = [...slots].filter(s => s.slot_level != null).sort((a, b) => a.slot_level - b.slot_level)
  if (sorted.length === 0) return null

  const totalMax = sorted.reduce((s, r) => s + r.max_value * r.slot_level, 0)
  const totalCur = sorted.reduce((s, r) => s + (r.current_value ?? 0) * r.slot_level, 0)

  const distribute = (newTotal) => {
    const work = sorted.map(s => ({ ...s }))
    let curTotal = work.reduce((s, r) => s + (r.current_value ?? 0) * r.slot_level, 0)
    let diff = newTotal - curTotal
    if (diff === 0) return

    if (diff > 0) {
      let remaining = diff
      for (const s of work.sort((a, b) => a.slot_level - b.slot_level)) {
        const pts = s.slot_level
        while (remaining >= pts && (s.current_value ?? 0) < s.max_value) {
          s.current_value = (s.current_value ?? 0) + 1
          remaining -= pts
        }
      }
    } else {
      let remaining = -diff
      for (const s of work.sort((a, b) => b.slot_level - a.slot_level)) {
        const pts = s.slot_level
        while (remaining >= pts && (s.current_value ?? 0) > 0) {
          s.current_value = (s.current_value ?? 0) - 1
          remaining -= pts
        }
      }
    }

    for (const s of work) {
      const orig = sorted.find(x => x.id === s.id)
      if (orig && (orig.current_value ?? 0) !== (s.current_value ?? 0)) {
        onChange(playerId, s.id, 'current_value', s.current_value ?? 0)
      }
    }
  }

  const adjustSlot = (slotLevel, delta) => {
    const slot = sorted.find(s => s.slot_level === slotLevel)
    if (!slot) return
    const cur = slot.current_value ?? 0
    const newVal = Math.max(0, Math.min(slot.max_value, cur + delta))
    if (newVal !== cur) {
      onChange(playerId, slot.id, 'current_value', newVal)
    }
  }

  return (
    <div className="mb-1 rounded border border-line bg-panel p-1.5">
      <span className="text-[10px] font-medium uppercase tracking-wide text-accent">Spell Slots</span>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="range"
          min="0"
          max={totalMax}
          step="1"
          value={Math.min(totalCur, totalMax)}
          onChange={(e) => distribute(parseInt(e.target.value) || 0)}
          className="flex-1 accent-accent"
        />
        <span className="mono shrink-0 text-[10px] text-dim">{totalCur}/{totalMax}</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        {sorted.map((s) => {
          const cur = s.current_value ?? 0
          const lv = s.slot_level
          return (
            <div key={s.id} className="flex items-center rounded border border-line bg-ink">
              <button
                onClick={() => adjustSlot(lv, -1)}
                className="px-1 py-0.5 text-[10px] text-dim hover:text-fg"
              >
                −
              </button>
              <span className="flex items-center gap-1 px-1 text-[10px]">
                <span className="h-2 w-2 rounded-full" style={{ background: cur > 0 ? 'var(--accent)' : 'var(--line)' }} />
                Lv{lv}
                <span className="mono text-[9px]">{cur}/{s.max_value}</span>
              </span>
              <button
                disabled={cur >= s.max_value}
                onClick={() => adjustSlot(lv, 1)}
                className="px-1 py-0.5 text-[10px] text-dim hover:text-fg disabled:opacity-30"
              >
                +
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}


