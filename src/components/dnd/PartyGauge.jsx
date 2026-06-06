import { useState, useEffect } from "react"
import { api } from "../../lib/dnd/api"

const COLOR = {
  ok: "var(--ok)", warn: "var(--warn)", risk: "var(--risk)", crit: "var(--crit)",
}

function Bar({ label, value, color }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 text-[10px] uppercase tracking-wide text-dim">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink">
        <div className="gauge-fill h-full rounded-full" style={{ width: `${value}%`, background: color }} />
      </div>
      <span className="mono w-9 text-right text-xs">{value}%</span>
    </div>
  )
}

export function PartyGauge({ report, players, onRefresh }) {
  const [open, setOpen] = useState(false)
  const [expandedPlayer, setExpandedPlayer] = useState(null)
  const [localPlayers, setLocalPlayers] = useState(players || [])

  useEffect(() => {
    setLocalPlayers(players || [])
  }, [players])

  if (!report) return null
  const tierColor = COLOR[report.risk.color] ?? "var(--dim)"

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

  const shortRest = async (playerId) => {
    const p = localPlayers.find((x) => x.id === playerId)
    if (!p) return
    const batch = (p.resources || []).filter((r) => r.recovery_type === 'short_rest')
    for (const r of batch) {
      await api.patch('/api/dnd/players/resources', { id: r.id, current_value: r.max_value })
    }
    setLocalPlayers((prev) =>
      prev.map((pl) =>
        pl.id === playerId
          ? { ...pl, resources: (pl.resources || []).map((r) => (r.recovery_type === 'short_rest' ? { ...r, current_value: r.max_value } : r)) }
          : pl
      )
    )
    if (onRefresh) onRefresh()
  }

  const longRest = async (playerId) => {
    const p = localPlayers.find((x) => x.id === playerId)
    if (!p) return
    const batch = p.resources || []
    for (const r of batch) {
      await api.patch('/api/dnd/players/resources', { id: r.id, current_value: r.max_value })
    }
    setLocalPlayers((prev) =>
      prev.map((pl) =>
        pl.id === playerId
          ? { ...pl, resources: (pl.resources || []).map((r) => ({ ...r, current_value: r.max_value })) }
          : pl
      )
    )
    if (onRefresh) onRefresh()
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-30">
      {open && (
        <div className="mx-auto max-w-[1400px] px-4">
          <div className="fadeup rounded-t-lg border border-b-0 border-line bg-panel p-4 shadow-2xl">
            <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-2">
              <div className="min-w-[220px] flex-1">
                <Bar label="Offense" value={report.category.offense} color="var(--accent)" />
                <div className="mt-1.5"><Bar label="Defense" value={report.category.defense} color="var(--player)" /></div>
                <div className="mt-1.5"><Bar label="Sustain" value={report.category.sustain} color="var(--ok)" /></div>
              </div>
              <div className="text-xs text-dim">
                <p className="text-fg">{report.risk.guidance}</p>
                <p className="mt-1">Safe to run: {report.risk.safeEncounter}</p>
                {report.shortRestWouldHelp && (
                  <p className="mt-1 text-warn">⟳ A short rest would restore meaningful combat value.</p>
                )}
              </div>
            </div>

            <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {localPlayers.map((p) => {
                const spotlight = p.id === report.spotlightPlayerId
                const depleted = p.id === report.depletedPlayerId
                const expanded = expandedPlayer === p.id
                const perPlayer = report.perPlayer?.find((pp) => pp.playerId === p.id)
                return (
                  <div
                    key={p.id}
                    className={`rounded border bg-ink ${expanded ? 'border-accent' : 'border-line'}`}
                  >
                    <button
                      onClick={() => setExpandedPlayer(expanded ? null : p.id)}
                      className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
                    >
                      <span className="flex-1 truncate text-sm">
                        {spotlight && <span title="Most resources left — spotlight them">🎯 </span>}
                        {depleted && <span title="Running on empty">⚠ </span>}
                        {p.name}
                      </span>
                      {p.is_active && <span className="text-[10px] text-player">●</span>}
                      <span className="mono text-xs text-dim">{perPlayer?.resourcesRemainingPct ?? 100}%</span>
                      <span className="mono text-sm font-bold" style={{ color: tierColorFor(perPlayer?.overall ?? 100) }}>
                        {perPlayer?.overall ?? 100}
                      </span>
                      <span className="text-xs text-dim">{expanded ? '▴' : '▾'}</span>
                    </button>

                    {expanded && (
                      <div className="border-t border-line px-2.5 pb-2 pt-1.5">
                        {(p.resources || []).length === 0 && (
                          <p className="py-2 text-center text-[10px] text-dim">No resources defined.</p>
                        )}
                        {(p.resources || []).map((r) => (
                          <div key={r.id} className="mb-1.5 rounded border border-line bg-panel p-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-medium">{r.name}</span>
                              {r.resource_type === 'spell_slot' && r.slot_level != null && (
                                <span className="text-[9px] text-accent">Lv{r.slot_level}</span>
                              )}
                            </div>
                            <div className="mt-1 flex items-center gap-2">
                              <input
                                type="range"
                                min="0"
                                max={r.max_value}
                                step="1"
                                value={r.current_value ?? 0}
                                onChange={(e) => updateResource(p.id, r.id, 'current_value', parseInt(e.target.value) || 0)}
                                className="flex-1 accent-accent"
                              />
                              <input
                                type="number"
                                min="0"
                                className="mono w-12 rounded border border-line bg-ink px-1 py-0.5 text-center text-[11px]"
                                value={r.current_value ?? 0}
                                onChange={(e) => {
                                  const val = Math.max(0, Math.min(r.max_value, parseInt(e.target.value) || 0))
                                  updateResource(p.id, r.id, 'current_value', val)
                                }}
                              />
                              <span className="mono text-[10px] text-dim">/{r.max_value}</span>
                            </div>
                            <div className="mt-0.5 flex items-center justify-between">
                              <div className="flex items-center gap-1 text-[9px] text-dim">
                                <span>Max</span>
                                <input
                                  type="number"
                                  min="0"
                                  className="mono w-10 rounded border border-line bg-ink px-1 py-0.5 text-center text-[10px]"
                                  value={r.max_value}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value) || 0
                                    updateResource(p.id, r.id, 'max_value', val)
                                  }}
                                />
                              </div>
                              {r.recovery_type && (
                                <span className="text-[9px] uppercase text-dim">{r.recovery_type === 'short_rest' ? 'SR' : 'LR'}</span>
                              )}
                            </div>
                          </div>
                        ))}
                        {(p.resources || []).length > 0 && (
                          <div className="mt-1.5 flex gap-1">
                            <button
                              onClick={() => shortRest(p.id)}
                              className="flex-1 rounded border border-line bg-ink px-2 py-1 text-[10px] text-dim hover:border-accent hover:text-fg"
                            >
                              Short Rest
                            </button>
                            <button
                              onClick={() => longRest(p.id)}
                              className="flex-1 rounded border border-line bg-ink px-2 py-1 text-[10px] text-dim hover:border-accent hover:text-fg"
                            >
                              Long Rest
                            </button>
                          </div>
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
        style={{ boxShadow: `inset 0 2px 0 0 ${tierColor}` }}
      >
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: tierColor, boxShadow: `0 0 8px ${tierColor}` }} />
          <span className="display text-sm font-bold uppercase tracking-wide" style={{ color: tierColor }}>
            {report.risk.label}
          </span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink">
            <div className="gauge-fill h-full rounded-full" style={{ width: `${report.overall}%`, background: tierColor }} />
          </div>
          <span className="mono text-sm font-bold" style={{ color: tierColor }}>{report.overall}%</span>
          <span className="text-xs text-dim">{open ? "▾" : "▴"}</span>
        </div>
      </button>
    </div>
  )
}

function tierColorFor(v) {
  if (v > 75) return COLOR.ok
  if (v > 50) return COLOR.warn
  if (v > 25) return COLOR.risk
  return COLOR.crit
}
