import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../../lib/dnd/api'
import { XP_THRESHOLDS, encounterMultiplier } from '../../../lib/dnd/reference'
import { DndLayout } from '../DndLayout'
import { SlideOver } from '../SlideOver'

function emptyEncounter() {
  return { name: '', description: '', environment: '' }
}

function calcDifficulty(encounter, partyLevel, partySize) {
  if (!encounter?.monsters?.length || !partyLevel || !partySize) return null
  const thresholds = XP_THRESHOLDS[partyLevel]
  if (!thresholds) return null

  const totalXp = encounter.monsters.reduce((sum, m) => {
    const t = XP_THRESHOLDS[partyLevel]
    if (!t) return sum
    const base = xpForCr(m.cr)
    return sum + base * (m.monster_count || 1)
  }, 0)

  const multiplier = encounterMultiplier(encounter.monsters.reduce((s, m) => s + (m.monster_count || 1), 0))
  const adjustedXp = totalXp * multiplier
  const perPlayer = adjustedXp / partySize

  let label = 'trivial'
  let color = 'var(--dim)'
  if (perPlayer >= thresholds.deadly) { label = 'deadly'; color = 'var(--crit)' }
  else if (perPlayer >= thresholds.hard) { label = 'hard'; color = 'var(--risk)' }
  else if (perPlayer >= thresholds.medium) { label = 'medium'; color = 'var(--warn)' }
  else if (perPlayer >= thresholds.easy) { label = 'easy'; color = 'var(--ok)' }

  return { totalXp, adjustedXp, perPlayer, label, color, multiplier }
}

function xpForCr(cr) {
  const map = {
    0: 10, 0.125: 25, 0.25: 50, 0.5: 100, 1: 200, 2: 450, 3: 700, 4: 1100, 5: 1800,
    6: 2300, 7: 2900, 8: 3900, 9: 5000, 10: 5900, 11: 7200, 12: 8400, 13: 10000,
    14: 11500, 15: 13000, 16: 15000, 17: 18000, 18: 20000, 19: 22000, 20: 25000,
    21: 33000, 22: 41000, 23: 50000, 24: 62000, 25: 75000, 26: 90000, 27: 105000,
    28: 120000, 29: 135000, 30: 155000,
  }
  return map[cr] ?? 0
}

export function EncountersPage() {
  const navigate = useNavigate()
  const [encounters, setEncounters] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyEncounter())
  const [partyLevel, setPartyLevel] = useState(5)
  const [partySize, setPartySize] = useState(4)
  const [addMonsterId, setAddMonsterId] = useState('')
  const [addMonsterCount, setAddMonsterCount] = useState(1)
  const [availableMonsters, setAvailableMonsters] = useState([])

  const loadEncounters = async () => {
    setLoading(true)
    try {
      const data = await api.get('/api/dnd/encounters')
      setEncounters(data.encounters || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadEncounters() }, [])

  const selectEncounter = async (enc) => {
    try {
      const detail = await api.get(`/api/dnd/encounters?id=${enc.id}`)
      setSelected(detail)
      const data = await api.get('/api/dnd/monsters')
      setAvailableMonsters(data.monsters || [])
      setAddMonsterId('')
      setAddMonsterCount(1)
    } catch (err) {
      setError(err.message)
    }
  }

  const createEncounter = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return
    try {
      await api.post('/api/dnd/encounters', form)
      await loadEncounters()
      setForm(emptyEncounter())
      setShowForm(false)
    } catch (err) {
      setError(err.message)
    }
  }

  const deleteEncounter = async (id) => {
    try {
      await api.del(`/api/dnd/encounters?id=${id}`)
      setEncounters((prev) => prev.filter((e) => e.id !== id))
      if (selected?.id === id) setSelected(null)
    } catch (err) {
      setError(err.message)
    }
  }

  const addMonsterToEncounter = async () => {
    if (!addMonsterId || !selected) return
    try {
      await api.patch('/api/dnd/encounters', { id: selected.id, _addMonster: { monster_id: addMonsterId, quantity: addMonsterCount } })
      const detail = await api.get(`/api/dnd/encounters?id=${selected.id}`)
      setSelected(detail)
    } catch (err) {
      setError(err.message)
    }
  }

  const removeMonsterFromEncounter = async (entryId) => {
    if (!selected) return
    try {
      await api.patch('/api/dnd/encounters', { id: selected.id, _removeMonster: entryId })
      const detail = await api.get(`/api/dnd/encounters?id=${selected.id}`)
      setSelected(detail)
    } catch (err) {
      setError(err.message)
    }
  }

  const startCombat = async () => {
    if (!selected) return
    try {
      const result = await api.patch('/api/dnd/encounters', { id: selected.id, _startCombat: true })
      navigate(`/dm/dnd/combat?sessionId=${result.session_id}`)
    } catch (err) {
      setError(err.message)
    }
  }

  if (loading) {
    return (
      <DndLayout>
        <div className="flex items-center justify-center py-24 text-sm text-dim">Loading encounters...</div>
      </DndLayout>
    )
  }

  const selectedMonsters = selected?.monsters || []
  const difficulty = calcDifficulty(selected, partyLevel, partySize)

  return (
    <DndLayout>
      <div className="flex items-center justify-between">
        <h1 className="display text-lg font-bold text-accent">Encounters</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded bg-panel-2 px-3 py-1.5 text-xs font-medium text-dim hover:text-fg"
        >
          {showForm ? 'Cancel' : '+ New Encounter'}
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded border border-crit/30 bg-crit/5 px-4 py-2 text-xs text-crit">{error}</div>
      )}

      {showForm && (
        <form onSubmit={createEncounter} className="mt-4 rounded border border-line bg-panel p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Input label="Name" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} required />
            <Input label="Environment" value={form.environment} onChange={(v) => setForm((f) => ({ ...f, environment: v }))} />
          </div>
          <div className="mt-3">
            <label className="block text-xs text-dim">Description</label>
            <textarea
              className="mt-1 w-full rounded border border-line bg-ink px-3 py-2 text-sm outline-none focus:border-accent"
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="mt-4 flex justify-end">
            <button type="submit" className="rounded bg-accent px-5 py-2 text-sm font-bold text-ink hover:brightness-110">
              Create Encounter
            </button>
          </div>
        </form>
      )}

      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_420px]">
        <div className="space-y-1">
          {encounters.length === 0 && (
            <div className="py-12 text-center text-sm text-dim">No encounters yet.</div>
          )}
          {encounters.map((enc) => (
            <button
              key={enc.id}
              onClick={() => selectEncounter(enc)}
              className={`flex w-full items-center gap-3 rounded border px-4 py-2.5 text-left transition-colors ${
                selected?.id === enc.id ? 'border-accent bg-accent-soft' : 'border-line bg-panel hover:border-accent/30'
              }`}
            >
              <span className="flex-1 min-w-0">
                <span className="text-sm font-medium">{enc.name}</span>
                {enc.environment && <span className="ml-2 text-xs text-dim">{enc.environment}</span>}
              </span>
              {enc.monster_count != null && (
                <span className="mono text-xs text-dim">{enc.monster_count} monsters</span>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); deleteEncounter(enc.id) }}
                className="text-xs text-dim hover:text-crit"
                title="Delete"
              >
                ✕
              </button>
            </button>
          ))}
        </div>

        <SlideOver
          open={!!selected}
          onClose={() => setSelected(null)}
          title={selected?.name ?? 'Encounter'}
          width="max-w-lg"
        >
          {selected && (
            <div className="space-y-4">
              {selected.description && (
                <p className="text-xs text-dim">{selected.description}</p>
              )}
              {selected.environment && (
                <p className="text-xs text-dim">Environment: {selected.environment}</p>
              )}

              <div className="flex items-center gap-3 rounded border border-line bg-ink p-3">
                <div>
                  <label className="text-xs text-dim">Party Level</label>
                  <input
                    type="number"
                    className="mono mt-1 w-16 rounded border border-line bg-panel px-2 py-1 text-center text-xs"
                    value={partyLevel}
                    onChange={(e) => setPartyLevel(parseInt(e.target.value) || 1)}
                    min={1}
                    max={20}
                  />
                </div>
                <div>
                  <label className="text-xs text-dim">Party Size</label>
                  <input
                    type="number"
                    className="mono mt-1 w-16 rounded border border-line bg-panel px-2 py-1 text-center text-xs"
                    value={partySize}
                    onChange={(e) => setPartySize(parseInt(e.target.value) || 1)}
                    min={1}
                  />
                </div>
                {difficulty && (
                  <div className="ml-auto text-right">
                    <div className="text-xs text-dim">Difficulty</div>
                    <div className="mono text-sm font-bold" style={{ color: difficulty.color }}>
                      {difficulty.label.toUpperCase()}
                    </div>
                    <div className="text-[10px] text-dim">{difficulty.adjustedXp} XP</div>
                  </div>
                )}
              </div>

              <div className="border-t border-line pt-4">
                <h3 className="text-xs font-medium uppercase tracking-wide text-accent">Monsters</h3>
                <div className="mt-2 flex gap-2">
                  <select
                    className="flex-1 rounded border border-line bg-ink px-2 py-1.5 text-xs outline-none focus:border-accent"
                    value={addMonsterId}
                    onChange={(e) => setAddMonsterId(e.target.value)}
                  >
                    <option value="">Select monster...</option>
                    {availableMonsters.map((m) => (
                      <option key={m.id} value={m.id}>{m.name} (CR {m.cr})</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    className="mono w-12 rounded border border-line bg-ink px-2 py-1.5 text-center text-xs"
                    value={addMonsterCount}
                    onChange={(e) => setAddMonsterCount(parseInt(e.target.value) || 1)}
                    min={1}
                  />
                  <button
                    onClick={addMonsterToEncounter}
                    className="rounded bg-panel-2 px-3 py-1.5 text-xs text-dim hover:text-fg"
                  >
                    + Add
                  </button>
                </div>

                <div className="mt-3 space-y-1">
                  {selectedMonsters.length === 0 && (
                    <p className="text-xs text-dim">No monsters in this encounter.</p>
                  )}
                  {selectedMonsters.map((entry) => (
                    <div key={entry.id} className="flex items-center gap-3 rounded border border-line bg-ink px-3 py-2">
                      <span className="flex-1 text-sm font-medium">{entry.name}</span>
                      <span className="mono text-xs text-dim">CR {entry.cr}</span>
                      <span className="mono text-xs text-dim">×{entry.monster_count || 1}</span>
                      <button
                        onClick={() => removeMonsterFromEncounter(entry.id)}
                        className="text-xs text-dim hover:text-crit"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-line pt-4">
                <button
                  onClick={startCombat}
                  className="rounded bg-accent px-5 py-2 text-sm font-bold text-ink hover:brightness-110"
                >
                  Start Combat
                </button>
                <button
                  onClick={() => deleteEncounter(selected.id)}
                  className="rounded border border-crit/30 px-4 py-2 text-xs text-crit hover:bg-crit/10"
                >
                  Delete
                </button>
              </div>
            </div>
          )}
        </SlideOver>
      </div>
    </DndLayout>
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
