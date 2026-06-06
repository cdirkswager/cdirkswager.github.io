import { useState, useEffect } from 'react'
import { api } from '../../../lib/dnd/api'
import { RESOURCE_TEMPLATES, spellSlotTemplate } from '../../../lib/dnd/reference'
import { DndLayout } from '../DndLayout'

function emptyPlayer() {
  return { name: '', level: 1, class: '', ac: 10, max_hp: 10 }
}

export function PlayersPage() {
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyPlayer())
  const [expandedId, setExpandedId] = useState(null)

  const loadPlayers = async () => {
    setLoading(true)
    try {
      const data = await api.get('/api/dnd/players')
      setPlayers(data.players || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadPlayers() }, [])

  const addPlayer = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return
    try {
      await api.post('/api/dnd/players', form)
      await loadPlayers()
      setForm(emptyPlayer())
      setShowForm(false)
    } catch (err) {
      setError(err.message)
    }
  }

  const deletePlayer = async (id) => {
    try {
      await api.del(`/api/dnd/players?id=${id}`)
      setPlayers((prev) => prev.filter((p) => p.id !== id))
      if (expandedId === id) setExpandedId(null)
    } catch (err) {
      setError(err.message)
    }
  }

  const updatePlayer = async (id, updates) => {
    try {
      await api.patch('/api/dnd/players', { id, ...updates })
      setPlayers((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)))
    } catch (err) {
      setError(err.message)
    }
  }

  const toggleActive = async (p) => {
    const next = p.is_active ? 0 : 1
    try {
      await api.patch('/api/dnd/players', { id: p.id, is_active: next })
      setPlayers((prev) => prev.map((pl) => (pl.id === p.id ? { ...pl, is_active: next } : pl)))
    } catch (err) {
      setError(err.message)
    }
  }

  const notifyResources = () => window.dispatchEvent(new Event('dnd-resources-changed'))

  const addResource = async (playerId, resource) => {
    try {
      const r = await api.post('/api/dnd/players/resources', { player_id: playerId, ...resource })
      setPlayers((prev) =>
        prev.map((p) =>
          p.id === playerId ? { ...p, resources: [...(p.resources || []), { ...resource, id: r.id }] } : p
        )
      )
      notifyResources()
    } catch (err) {
      setError(err.message)
    }
  }

  const deleteResource = async (playerId, resourceId) => {
    try {
      await api.del(`/api/dnd/players/resources?id=${resourceId}`)
      setPlayers((prev) =>
        prev.map((p) =>
          p.id === playerId
            ? { ...p, resources: (p.resources || []).filter((r) => r.id !== resourceId) }
            : p
        )
      )
      notifyResources()
    } catch (err) {
      setError(err.message)
    }
  }

  if (loading) {
    return (
      <DndLayout>
        <div className="flex items-center justify-center py-24 text-sm text-dim">Loading party...</div>
      </DndLayout>
    )
  }

  return (
    <DndLayout>
      <div className="flex items-center justify-between">
        <h1 className="display text-lg font-bold text-accent">Party</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded bg-panel-2 px-3 py-1.5 text-xs font-medium text-dim hover:text-fg"
        >
          {showForm ? 'Cancel' : '+ Add'}
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded border border-crit/30 bg-crit/5 px-4 py-2 text-xs text-crit">{error}</div>
      )}

      {showForm && (
        <form onSubmit={addPlayer} className="mt-3 rounded border border-line bg-panel p-3">
          <div className="flex flex-wrap gap-2">
            <input
              placeholder="Name" required
              className="min-w-[120px] flex-1 rounded border border-line bg-ink px-2.5 py-1.5 text-xs outline-none focus:border-accent"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <CompactInput placeholder="Class" value={form.class} onChange={(v) => setForm((f) => ({ ...f, class: v }))} />
            <CompactNum placeholder="Lvl" value={form.level} onChange={(v) => setForm((f) => ({ ...f, level: v }))} />
            <CompactNum placeholder="HP" value={form.max_hp} onChange={(v) => setForm((f) => ({ ...f, max_hp: v }))} />
            <CompactNum placeholder="AC" value={form.ac} onChange={(v) => setForm((f) => ({ ...f, ac: v }))} />
            <button type="submit" className="rounded bg-accent px-3 py-1.5 text-xs font-bold text-ink hover:brightness-110">
              Add
            </button>
          </div>
        </form>
      )}

      <div className="mt-3 space-y-1">
        {players.length === 0 && (
          <div className="py-12 text-center text-sm text-dim">No party members yet.</div>
        )}
        {players.map((p) => {
          const expanded = expandedId === p.id
          const res = p.resources || []
          return (
            <div
              key={p.id}
              className={`rounded border bg-panel ${p.is_active ? 'border-l-2 border-accent border-line' : 'border-line'}`}
            >
              <div className="flex items-center gap-2 px-3 py-2">
                <label className="flex cursor-pointer items-center gap-1" title={p.is_active ? 'Active' : 'Inactive'}>
                  <input
                    type="checkbox"
                    checked={!!p.is_active}
                    onChange={() => toggleActive(p)}
                    className="accent-accent h-3 w-3 cursor-pointer"
                  />
                </label>
                <button
                  onClick={() => setExpandedId(expanded ? null : p.id)}
                  className="flex flex-1 items-center gap-3 text-left"
                >
                  <span className="truncate text-sm font-semibold text-player">{p.name}</span>
                  {(p.class || p.player_class) && <span className="rounded bg-ink px-1.5 py-0.5 text-[10px] text-dim">{p.class || p.player_class}</span>}
                  <span className="text-[10px] text-dim">Lv{p.level}</span>
                  <span className="text-[10px] text-dim">HP {p.max_hp}</span>
                  <span className="text-[10px] text-dim">AC {p.ac}</span>
                </button>
                <span className="text-[10px] text-dim">{expanded ? '▴' : '▾'}</span>
              </div>

              {expanded && (
                <div className="border-t border-line px-3 pb-3 pt-2">
                  <div className="mb-3 flex flex-wrap gap-2">
                    <InlineEdit label="Name" value={p.name} onChange={(v) => updatePlayer(p.id, { name: v })} />
                    <InlineEdit label="Class" value={p.class || ''} onChange={(v) => updatePlayer(p.id, { class: v })} />
                    <InlineNum label="Lvl" value={p.level} onChange={(v) => updatePlayer(p.id, { level: v })} />
                    <InlineNum label="HP" value={p.max_hp} onChange={(v) => updatePlayer(p.id, { max_hp: v })} />
                    <InlineNum label="AC" value={p.ac} onChange={(v) => updatePlayer(p.id, { ac: v })} />
                  </div>

                  <div className="border-t border-line pt-2">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-dim">Resources</span>
                    <div className="mt-1 grid grid-cols-2 gap-1">
                      <div className="space-y-0.5">
                        {RESOURCE_TEMPLATES.map((tpl) => (
                          <button
                            key={tpl.name}
                            onClick={() => addResource(p.id, { ...tpl, current_value: tpl.max_value ?? 1, max_value: tpl.max_value ?? 1 })}
                            className="block w-full rounded border border-line bg-ink px-2 py-1 text-left text-[10px] text-dim hover:border-accent hover:text-fg"
                          >
                            {tpl.name}
                          </button>
                        ))}
                      </div>
                      <div className="space-y-0.5">
                        <button
                          onClick={() => {
                            for (let lv = 1; lv <= 3; lv++) {
                              const maxSlots = lv <= 2 ? 3 : 3
                              const tpl = spellSlotTemplate(lv, maxSlots)
                              addResource(p.id, { ...tpl, current_value: maxSlots, max_value: maxSlots })
                            }
                          }}
                          className="block w-full rounded border border-accent/40 bg-accent/5 px-2 py-1 text-left text-[10px] text-accent hover:bg-accent/10"
                        >
                          + Spell Slots (1st–3rd)
                        </button>
                        <button
                          onClick={() => {
                            for (let lv = 4; lv <= 6; lv++) {
                              const maxSlots = lv <= 4 ? 3 : lv <= 5 ? 2 : 1
                              const tpl = spellSlotTemplate(lv, maxSlots)
                              addResource(p.id, { ...tpl, current_value: maxSlots, max_value: maxSlots })
                            }
                          }}
                          className="block w-full rounded border border-accent/40 bg-accent/5 px-2 py-1 text-left text-[10px] text-accent hover:bg-accent/10"
                        >
                          + Spell Slots (4th–6th)
                        </button>
                        <button
                          onClick={() => {
                            for (let lv = 7; lv <= 9; lv++) {
                              const maxSlots = lv <= 7 ? 2 : lv <= 8 ? 2 : 1
                              const tpl = spellSlotTemplate(lv, maxSlots)
                              addResource(p.id, { ...tpl, current_value: maxSlots, max_value: maxSlots })
                            }
                          }}
                          className="block w-full rounded border border-accent/40 bg-accent/5 px-2 py-1 text-left text-[10px] text-accent hover:bg-accent/10"
                        >
                          + Spell Slots (7th–9th)
                        </button>
                        <div className="border-t border-line pt-0.5">
                          <button
                            onClick={() => {
                              const name = prompt('Resource name:')
                              if (name) addResource(p.id, { name, resource_type: 'numeric', recovery_type: 'long_rest', max_value: 1, current_value: 1 })
                            }}
                            className="block w-full rounded border border-line bg-ink px-2 py-1 text-left text-[10px] text-dim hover:border-accent hover:text-fg"
                          >
                            + Custom
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {res.length === 0 && (
                    <p className="pt-2 text-center text-[10px] text-dim">No resources.</p>
                  )}
                  {res.map((r) => (
                    <div key={r.id} className="mt-1 flex items-center gap-2 rounded border border-line bg-ink px-2 py-1">
                      <span className="flex-1 truncate text-[11px]">
                        {r.name}
                        {r.resource_type === 'spell_slot' && r.slot_level != null && (
                          <span className="ml-1 text-[10px] text-accent">Lv{r.slot_level}</span>
                        )}
                      </span>
                      <span className="text-[10px] text-dim">Max</span>
                      <input
                        type="number"
                        min="0"
                        className="mono w-12 rounded border border-line bg-panel px-1 py-0.5 text-center text-[10px]"
                        value={r.max_value}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 0
                          api.patch('/api/dnd/players/resources', { id: r.id, max_value: val })
                          setPlayers((prev) => prev.map((pl) =>
                            pl.id === p.id
                              ? { ...pl, resources: (pl.resources || []).map((x) => x.id === r.id ? { ...x, max_value: val } : x) }
                              : pl
                          ))
                          notifyResources()
                        }}
                      />
                      <button onClick={() => deleteResource(p.id, r.id)} className="text-[10px] text-dim hover:text-crit">✕</button>
                    </div>
                  ))}

                  <div className="mt-3 flex justify-end">
                    <button onClick={() => deletePlayer(p.id)} className="rounded px-2 py-1 text-[10px] text-dim hover:text-crit">
                      Remove
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </DndLayout>
  )
}

function CompactInput({ placeholder, value, onChange }) {
  return (
    <input
      placeholder={placeholder}
      className="w-20 rounded border border-line bg-ink px-2 py-1.5 text-xs outline-none focus:border-accent"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

function CompactNum({ placeholder, value, onChange }) {
  return (
    <input
      type="number"
      placeholder={placeholder}
      className="w-14 rounded border border-line bg-ink px-2 py-1.5 text-xs outline-none focus:border-accent"
      value={value}
      onChange={(e) => onChange(parseInt(e.target.value) || 1)}
    />
  )
}

function InlineEdit({ label, value, onChange }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] text-dim">{label}</span>
      <input
        className="w-24 rounded border border-line bg-ink px-1.5 py-0.5 text-xs outline-none focus:border-accent"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

function InlineNum({ label, value, onChange }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] text-dim">{label}</span>
      <input
        type="number"
        className="w-12 rounded border border-line bg-ink px-1.5 py-0.5 text-xs outline-none focus:border-accent"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value) || 1)}
      />
    </div>
  )
}


