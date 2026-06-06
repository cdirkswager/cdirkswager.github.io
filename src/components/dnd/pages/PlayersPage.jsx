import { useState, useEffect, useRef } from 'react'
import { api } from '../../../lib/dnd/api'
import { RESOURCE_TEMPLATES, spellSlotTemplate } from '../../../lib/dnd/reference'
import { DndLayout } from '../DndLayout'

function emptyPlayer() {
  return { name: '', level: 1, player_class: '', ac: 10, hp_max: 10, notes: '' }
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
      const result = await api.post('/api/dnd/players', form)
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

  const addResource = async (playerId, resource) => {
    try {
      const r = await api.post('/api/dnd/players/resources', { player_id: playerId, ...resource })
      setPlayers((prev) =>
        prev.map((p) =>
          p.id === playerId ? { ...p, resources: [...(p.resources || []), { ...resource, id: r.id }] } : p
        )
      )
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
    } catch (err) {
      setError(err.message)
    }
  }

  const updateResourceField = async (playerId, resourceId, field, value) => {
    const patch = { [field]: value }
    try {
      await api.patch('/api/dnd/players/resources', { id: resourceId, ...patch })
      setPlayers((prev) =>
        prev.map((p) =>
          p.id === playerId
            ? {
                ...p,
                resources: (p.resources || []).map((r) =>
                  r.id === resourceId ? { ...r, ...patch } : r
                ),
              }
            : p
        )
      )
    } catch (err) {
      setError(err.message)
    }
  }

  const addSpellSlots = async (playerId) => {
    for (let level = 1; level <= 9; level++) {
      const slots = level <= 2 ? 3 : level <= 4 ? 3 : level <= 6 ? 2 : level <= 8 ? 2 : 1
      await addResource(playerId, spellSlotTemplate(level, slots))
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
        <h1 className="display text-lg font-bold text-accent">Party Roster</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded bg-panel-2 px-3 py-1.5 text-xs font-medium text-dim hover:text-fg"
        >
          {showForm ? 'Cancel' : '+ Add Player'}
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded border border-crit/30 bg-crit/5 px-4 py-2 text-xs text-crit">{error}</div>
      )}

      {showForm && (
        <form onSubmit={addPlayer} className="mt-4 rounded border border-line bg-panel p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Input label="Name" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} required />
            <Input label="Class" value={form.player_class} onChange={(v) => setForm((f) => ({ ...f, player_class: v }))} />
            <Input label="Level" type="number" value={form.level} onChange={(v) => setForm((f) => ({ ...f, level: parseInt(v) || 1 }))} />
            <Input label="HP" type="number" value={form.hp_max} onChange={(v) => setForm((f) => ({ ...f, hp_max: parseInt(v) || 10 }))} />
            <Input label="AC" type="number" value={form.ac} onChange={(v) => setForm((f) => ({ ...f, ac: parseInt(v) || 10 }))} />
          </div>
          <div className="mt-3">
            <label className="block text-xs text-dim">Notes</label>
            <textarea
              className="mt-1 w-full rounded border border-line bg-ink px-3 py-2 text-sm outline-none focus:border-accent"
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
          <div className="mt-4 flex justify-end">
            <button type="submit" className="rounded bg-accent px-5 py-2 text-sm font-bold text-ink hover:brightness-110">
              Add to Party
            </button>
          </div>
        </form>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {players.length === 0 && (
          <div className="col-span-full py-12 text-center text-sm text-dim">No party members yet.</div>
        )}
        {players.map((p) => {
          const expanded = expandedId === p.id
          const res = p.resources || []
          return (
            <div
              key={p.id}
              className={`rounded border bg-panel fadeup ${
                p.is_active ? 'border-l-2 border-accent border-line' : 'border-line'
              }`}
            >
              <div className="flex items-center gap-2 px-4 pt-3">
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-dim hover:text-fg" title={p.is_active ? 'Active in party' : 'Inactive'}>
                  <input
                    type="checkbox"
                    checked={!!p.is_active}
                    onChange={() => toggleActive(p)}
                    className="accent-accent h-3.5 w-3.5 cursor-pointer"
                  />
                  <span>{p.is_active ? 'Active' : 'Off'}</span>
                </label>
              </div>
              <button
                onClick={() => setExpandedId(expanded ? null : p.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-player">{p.name}</span>
                    {p.player_class && (
                      <span className="shrink-0 rounded bg-ink px-1.5 py-0.5 text-[10px] text-dim">{p.player_class}</span>
                    )}
                  </div>
                  <div className="mt-0.5 flex gap-3 text-xs text-dim">
                    <span>Lvl {p.level}</span>
                    <span>HP {p.hp_max}</span>
                    <span>AC {p.ac}</span>
                  </div>
                </div>
                <span className="text-xs text-dim">{expanded ? '▴' : '▾'}</span>
              </button>

              {expanded && (
                <div className="border-t border-line px-4 pb-4 pt-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-dim uppercase tracking-wide">Resources</span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => addSpellSlots(p.id)}
                          className="rounded bg-ink px-2 py-1 text-[10px] text-dim hover:text-fg"
                          title="Add spell slots for all levels"
                        >
                          + Spell Slots
                        </button>
                        <ResourceDropdown
                          onSelect={(tpl) => addResource(p.id, { ...tpl, max_value: 1, current_value: 1 })}
                          templates={RESOURCE_TEMPLATES}
                        />
                        <button
                          onClick={() => {
                            const name = prompt('Resource name:')
                            if (name) addResource(p.id, { name, resource_type: 'numeric', recovery_type: 'long_rest', max_value: 1, current_value: 1, weight_damage_boost: 0.33, weight_damage_reduction: 0.33, weight_healing: 0.33 })
                          }}
                          className="rounded bg-ink px-2 py-1 text-[10px] text-dim hover:text-fg"
                          title="Add custom resource"
                        >
                          + Custom
                        </button>
                      </div>
                    </div>

                    {res.length === 0 && (
                      <p className="text-xs text-dim">No resources defined.</p>
                    )}

                    {res.map((r) => (
                      <ResourceCard
                        key={r.id}
                        resource={r}
                        playerId={p.id}
                        onDelete={deleteResource}
                        onUpdate={updateResourceField}
                      />
                    ))}
                  </div>

                  <div className="mt-4 flex justify-end">
                    <button
                      onClick={() => deletePlayer(p.id)}
                      className="rounded px-3 py-1 text-xs text-dim hover:text-crit"
                    >
                      Remove Player
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

function ResourceCard({ resource: r, playerId, onDelete, onUpdate }) {
  const [showWeights, setShowWeights] = useState(false)

  return (
    <div className="rounded border border-line bg-ink p-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">{r.name}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowWeights((v) => !v)}
            className="rounded px-1.5 py-0.5 text-[10px] text-dim hover:text-fg"
            title="Toggle weights"
          >
            {showWeights ? '▸' : '▾'}
          </button>
          <button
            onClick={() => onDelete(playerId, r.id)}
            className="text-xs text-dim hover:text-crit"
          >
            ✕
          </button>
        </div>
      </div>
      {r.resource_type === 'spell_slot' && r.slot_level != null && (
        <span className="text-[10px] text-accent">Level {r.slot_level}</span>
      )}
      <div className="mt-1.5 flex items-center gap-3">
        <div className="flex items-center gap-1 text-xs">
          <span className="text-dim">Current:</span>
          <input
            type="number"
            min="0"
            max={r.max_value}
            className="mono w-14 rounded border border-line bg-panel px-1.5 py-0.5 text-center text-xs"
            value={r.current_value ?? 0}
            onChange={(e) => {
              const val = Math.max(0, Math.min(r.max_value, parseInt(e.target.value) || 0))
              onUpdate(playerId, r.id, 'current_value', val)
            }}
          />
        </div>
        <span className="mono text-[10px] text-dim">/ {r.max_value}</span>
      </div>
      <div className="mt-1.5">
        <input
          type="range"
          min="0"
          max={r.max_value}
          step="1"
          value={r.current_value ?? 0}
          onChange={(e) => onUpdate(playerId, r.id, 'current_value', parseInt(e.target.value) || 0)}
          className="w-full accent-accent"
        />
        <div className="flex justify-between text-[9px] text-dim">
          <span>0</span>
          <span>consume</span>
          <span>{r.max_value}</span>
        </div>
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs">
        <span className="text-dim">Max:</span>
        <input
          type="number"
          className="mono w-12 rounded border border-line bg-panel px-1 py-0.5 text-center text-xs"
          value={r.max_value}
          onChange={(e) => {
            const val = parseInt(e.target.value) || 0
            onUpdate(playerId, r.id, 'max_value', val)
          }}
        />
      </div>
      {showWeights && (
        <div className="mt-2 space-y-1 border-t border-line pt-2">
          <WeightSlider
            label="Offense"
            value={r.weight_damage_boost}
            onChange={(v) => onUpdate(playerId, r.id, 'weight_damage_boost', parseFloat(v) || 0)}
          />
          <WeightSlider
            label="Defense"
            value={r.weight_damage_reduction}
            onChange={(v) => onUpdate(playerId, r.id, 'weight_damage_reduction', parseFloat(v) || 0)}
          />
          <WeightSlider
            label="Healing"
            value={r.weight_healing}
            onChange={(v) => onUpdate(playerId, r.id, 'weight_healing', parseFloat(v) || 0)}
          />
        </div>
      )}
    </div>
  )
}

function Input({ label, type = 'text', value, onChange, required }) {
  return (
    <div>
      <label className="block text-xs text-dim">{label}</label>
      <input
        type={type}
        required={required}
        className="mt-1 w-full rounded border border-line bg-ink px-3 py-2 text-sm outline-none focus:border-accent"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

function WeightSlider({ label, value, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 text-[10px] uppercase tracking-wide text-dim">{label}</span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 accent-accent"
      />
      <span className="mono w-8 text-right text-[10px] text-dim">{Math.round(value * 100)}%</span>
    </div>
  )
}

function ResourceDropdown({ onSelect, templates }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const handle = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded border border-line bg-ink px-2 py-1 text-[10px] text-dim hover:border-accent hover:text-fg"
      >
        + Template
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded border border-line bg-panel shadow-xl">
          {templates.map((tpl) => (
            <button
              key={tpl.name}
              onClick={() => { onSelect(tpl); setOpen(false) }}
              className="block w-full px-3 py-2 text-left text-xs text-dim hover:bg-panel-2 hover:text-fg"
            >
              {tpl.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
