import { useState, useEffect } from "react"
import { api } from "../../lib/dnd/api"

const COLOR = {
  ok: "var(--ok)", warn: "var(--warn)", risk: "var(--risk)", crit: "var(--crit)",
}

export function PartyGauge({ report, players, onRefresh }) {
  const [open, setOpen] = useState(false)
  const [localPlayers, setLocalPlayers] = useState(players || [])
  const [resting, setResting] = useState(false)

  useEffect(() => {
    setLocalPlayers(players || [])
  }, [players])

  if (!report) return null
  const tierColor = COLOR[report.risk.color] ?? "var(--dim)"

  const allResources = localPlayers.flatMap(
    (p) => (p.resources || []).map((r) => ({ ...r, playerName: p.name, playerId: p.id }))
  )
  const slotResources = allResources.filter((r) => r.resource_type === 'spell_slot')
  const otherResources = allResources.filter((r) => r.resource_type !== 'spell_slot')

  const updateResource = async (playerId, resourceId, field, value) => {
    setLocalPlayers((prev) =>
      prev.map((p) =>
        p.id === playerId
          ? { ...p, resources: (p.resources || []).map((r) => (r.id === resourceId ? { ...r, [field]: value } : r)) }
          : p
      )
    )
    await api.patch('/api/dnd/players/resources', { id: resourceId, [field]: value })
  }

  const shortRestAll = async () => {
    setResting(true)
    const targets = localPlayers.flatMap((p) =>
      (p.resources || []).filter((r) => r.recovery_type === 'short_rest').map((r) => r.id)
    )
    for (const id of targets) {
      const r = allResources.find((x) => x.id === id)
      if (r) await api.patch('/api/dnd/players/resources', { id, current_value: r.max_value })
    }
    setLocalPlayers((prev) =>
      prev.map((p) => ({
        ...p,
        resources: (p.resources || []).map((r) =>
          r.recovery_type === 'short_rest' ? { ...r, current_value: r.max_value } : r
        ),
      }))
    )
    if (onRefresh) onRefresh()
    setResting(false)
  }

  const longRestAll = async () => {
    setResting(true)
    const targets = localPlayers.flatMap((p) =>
      (p.resources || []).map((r) => r.id)
    )
    for (const id of targets) {
      const r = allResources.find((x) => x.id === id)
      if (r) await api.patch('/api/dnd/players/resources', { id, current_value: r.max_value })
    }
    setLocalPlayers((prev) =>
      prev.map((p) => ({
        ...p,
        resources: (p.resources || []).map((r) => ({ ...r, current_value: r.max_value })),
      }))
    )
    if (onRefresh) onRefresh()
    setResting(false)
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-30">
      {open && (
        <div className="mx-auto max-w-[1400px] px-4">
          <div className="fadeup rounded-t-lg border border-b-0 border-line bg-panel shadow-2xl">
            <div className="max-h-72 overflow-y-auto p-3">
              {otherResources.length === 0 && slotResources.length === 0 && (
                <p className="py-6 text-center text-xs text-dim">No resources defined. Add them in the Party tab.</p>
              )}

              {otherResources.map((r) => (
                <div key={r.id} className="mb-1 flex items-center gap-2 rounded border border-line bg-ink px-2 py-1">
                  <span className="w-20 truncate text-[11px] font-medium text-player">{r.playerName}</span>
                  <span className="w-28 truncate text-[11px] text-dim">{r.name}</span>
                  <input
                    type="range"
                    min="0"
                    max={r.max_value}
                    step="1"
                    value={r.current_value ?? 0}
                    onChange={(e) => updateResource(r.playerId, r.id, 'current_value', parseInt(e.target.value) || 0)}
                    className="flex-1 accent-accent"
                  />
                  <input
                    type="number"
                    min="0"
                    className="mono w-11 rounded border border-line bg-panel px-1 py-0.5 text-center text-[10px]"
                    value={r.current_value ?? 0}
                    onChange={(e) => {
                      const val = Math.max(0, Math.min(r.max_value, parseInt(e.target.value) || 0))
                      updateResource(r.playerId, r.id, 'current_value', val)
                    }}
                  />
                  <span className="mono text-[10px] text-dim">/{r.max_value}</span>
                  {r.recovery_type === 'short_rest' && <span className="mono text-[9px] text-warn">SR</span>}
                </div>
              ))}

              {slotResources.length > 0 && (
                <div className="mt-2 rounded border border-line bg-ink p-2">
                  <span className="text-[10px] font-medium uppercase tracking-wide text-accent">Spell Slots</span>
                  <div className="mt-1 space-y-0.5">
                    {groupSlots(localPlayers).map(({ playerName, slotLevel, current, max }, i) => (
                      <div key={i} className="flex items-center gap-2 text-[11px]">
                        <span className="w-20 truncate text-player">{playerName}</span>
                        <span className="w-6 text-dim">Lv{slotLevel}</span>
                        <span className="mono">
                          {dots(current, max)}
                        </span>
                        <span className="mono text-[10px] text-dim">
                          ({current}/{max})
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full border-t border-line bg-panel/95 backdrop-blur"
        style={{ boxShadow: `inset 0 2px 0 0 ${tierColor}` }}
      >
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: tierColor, boxShadow: `0 0 8px ${tierColor}` }} />
          <span className="display shrink-0 text-sm font-bold uppercase tracking-wide" style={{ color: tierColor }}>
            {report.risk.label}
          </span>
          <div className="h-1.5 w-32 shrink-0 overflow-hidden rounded-full bg-ink sm:w-48">
            <div className="gauge-fill h-full rounded-full" style={{ width: `${report.overall}%`, background: tierColor }} />
          </div>
          <span className="mono shrink-0 text-sm font-bold" style={{ color: tierColor }}>{report.overall}%</span>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={(e) => { e.stopPropagation(); shortRestAll() }}
              disabled={resting}
              className="rounded border border-line bg-ink px-2.5 py-1 text-[10px] font-medium text-dim hover:border-warn hover:text-warn disabled:opacity-40"
            >
              Short Rest
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); longRestAll() }}
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

function groupSlots(players) {
  const out = []
  for (const p of players) {
    const slots = (p.resources || []).filter((r) => r.resource_type === 'spell_slot' && r.slot_level != null)
    const byLevel = {}
    for (const s of slots) {
      if (!byLevel[s.slot_level]) byLevel[s.slot_level] = { current: 0, max: 0 }
      byLevel[s.slot_level].current += s.current_value ?? 0
      byLevel[s.slot_level].max += s.max_value ?? 0
    }
    for (const [level, v] of Object.entries(byLevel).sort((a, b) => Number(a[0]) - Number(b[0]))) {
      out.push({ playerName: p.name, slotLevel: Number(level), ...v })
    }
  }
  return out
}

function dots(current, max) {
  const filled = '●'.repeat(Math.min(current, max))
  const empty = '○'.repeat(Math.max(0, max - current))
  return filled + empty || '○'
}
