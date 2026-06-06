import { useState, useEffect, useRef } from 'react'
import { api } from '../../../lib/dnd/api'
import { StatBlockPanel } from '../StatBlockPanel'
import { SlideOver } from '../SlideOver'

function emptyMonster() {
  return {
    name: '', cr: 0.5, ac: 10, hp_max: 10, str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10,
    size: 'Medium', monster_type: '', alignment: 'unaligned', source: 'custom',
  }
}

const CR_OPTIONS = [0, 0.125, 0.25, 0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30]

export function MonstersPage() {
  const [monsters, setMonsters] = useState([])
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [selectedMonster, setSelectedMonster] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState(emptyMonster())
  const [importJson, setImportJson] = useState('')
  const [importStatus, setImportStatus] = useState('')
  const [error, setError] = useState(null)
  const inputRef = useRef(null)

  const loadMonsters = async (q) => {
    const url = q ? `/api/dnd/monsters?q=${encodeURIComponent(q)}` : '/api/dnd/monsters'
    try {
      const data = await api.get(url)
      setMonsters(data.monsters || [])
    } catch { /* handled */ }
  }

  useEffect(() => {
    if (query.length < 1) {
      loadMonsters()
      return
    }
    setSearching(true)
    const timer = setTimeout(async () => {
      await loadMonsters(query)
      setSearching(false)
    }, 250)
    return () => clearTimeout(timer)
  }, [query])

  const createMonster = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return
    try {
      await api.post('/api/dnd/monsters', form)
      await loadMonsters(query)
      setForm(emptyMonster())
      setShowCreate(false)
      setError(null)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleImport = async (e) => {
    e.preventDefault()
    setImportStatus('')
    try {
      const data = JSON.parse(importJson)
      const arr = Array.isArray(data) ? data : [data]
      let count = 0
      for (const m of arr) {
        await api.post('/api/dnd/monsters', m)
        count++
      }
      await loadMonsters(query)
      setImportStatus(`Imported ${count} monster(s)`)
      setImportJson('')
    } catch (err) {
      setImportStatus(`Error: ${err.message}`)
    }
  }

  const deleteMonster = async (id) => {
    try {
      await api.del(`/api/dnd/monsters?id=${id}`)
      setMonsters((prev) => prev.filter((m) => m.id !== id))
      if (selectedMonster?.id === id) setSelectedMonster(null)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="display text-lg font-bold text-accent">Bestiary</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="rounded bg-panel-2 px-3 py-1.5 text-xs font-medium text-dim hover:text-fg"
          >
            {showCreate ? 'Cancel' : '+ New Monster'}
          </button>
        </div>
      </div>

      <div className="mt-4">
        <input
          ref={inputRef}
          className="w-full rounded border border-line bg-panel px-4 py-2 text-sm outline-none placeholder:text-dim focus:border-accent"
          placeholder="Search monsters by name, type, or CR..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {error && (
        <div className="mt-3 rounded border border-crit/30 bg-crit/5 px-4 py-2 text-xs text-crit">{error}</div>
      )}

      {showCreate && (
        <form onSubmit={createMonster} className="mt-4 rounded border border-line bg-panel p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Input label="Name" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} required />
            <Input label="Size" value={form.size} onChange={(v) => setForm((f) => ({ ...f, size: v }))} />
            <Input label="Type" value={form.monster_type} onChange={(v) => setForm((f) => ({ ...f, monster_type: v }))} />
            <Input label="Alignment" value={form.alignment} onChange={(v) => setForm((f) => ({ ...f, alignment: v }))} />
            <div>
              <label className="block text-xs text-dim">CR</label>
              <select
                className="mt-1 w-full rounded border border-line bg-ink px-3 py-2 text-sm outline-none focus:border-accent"
                value={form.cr}
                onChange={(e) => setForm((f) => ({ ...f, cr: parseFloat(e.target.value) }))}
              >
                {CR_OPTIONS.map((cr) => <option key={cr} value={cr}>{cr === 0 ? '0' : cr < 1 ? `1/${Math.round(1 / cr)}` : cr}</option>)}
              </select>
            </div>
            <Input label="AC" type="number" value={form.ac} onChange={(v) => setForm((f) => ({ ...f, ac: parseInt(v) || 10 }))} />
            <Input label="HP" type="number" value={form.hp_max} onChange={(v) => setForm((f) => ({ ...f, hp_max: parseInt(v) || 10 }))} />
            {['str', 'dex', 'con', 'int', 'wis', 'cha'].map((k) => (
              <Input key={k} label={k.toUpperCase()} type="number" value={form[k]} onChange={(v) => setForm((f) => ({ ...f, [k]: parseInt(v) || 10 }))} />
            ))}
          </div>
          <div className="mt-4 flex justify-end">
            <button type="submit" className="rounded bg-accent px-5 py-2 text-sm font-bold text-ink hover:brightness-110">
              Create Monster
            </button>
          </div>
        </form>
      )}

      <form onSubmit={handleImport} className="mt-4">
        <details className="rounded border border-line bg-panel">
          <summary className="cursor-pointer px-4 py-2 text-xs font-medium text-dim hover:text-fg">
            Import from JSON
          </summary>
          <div className="border-t border-line p-4">
            <textarea
              className="w-full rounded border border-line bg-ink px-3 py-2 text-xs outline-none focus:border-accent"
              rows={6}
              placeholder='[{ "name": "My Monster", "cr": 5, "ac": 15, "hp_max": 100, ... }]'
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
            />
            <div className="mt-3 flex items-center justify-between">
              <button type="submit" className="rounded bg-panel-2 px-4 py-1.5 text-xs font-medium text-dim hover:text-fg">
                Import
              </button>
              {importStatus && <span className="text-xs text-accent">{importStatus}</span>}
            </div>
          </div>
        </details>
      </form>

      <div className="mt-4 space-y-1">
        {searching && (
          <div className="py-8 text-center text-sm text-dim">Searching...</div>
        )}
        {!searching && monsters.length === 0 && (
          <div className="py-12 text-center text-sm text-dim">
            {query ? 'No monsters match your search.' : 'No monsters in the bestiary yet.'}
          </div>
        )}
        {!searching && monsters.map((m) => (
          <div
            key={m.id}
            className="flex items-center gap-4 rounded border border-line bg-panel px-4 py-2.5 transition-colors hover:border-accent/30"
          >
            <button
              onClick={async () => {
                try {
                  const full = await api.get(`/api/dnd/monsters?id=${m.id}`)
                  setSelectedMonster(full)
                } catch { setSelectedMonster(m) }
              }}
              className="flex-1 min-w-0 text-left"
            >
              <span className="text-sm font-medium text-fg">{m.name}</span>
              <span className="ml-2 text-xs text-dim">{m.monster_type}</span>
            </button>
            <div className="flex items-center gap-4 text-xs text-dim mono">
              {m.cr != null && <span title="CR">CR {m.cr}</span>}
              {m.ac != null && <span title="AC">AC {m.ac}</span>}
              {m.hp_max != null && <span title="HP">HP {m.hp_max}</span>}
            </div>
            <button
              onClick={() => deleteMonster(m.id)}
              className="text-xs text-dim hover:text-crit"
              title="Delete"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <SlideOver
        open={!!selectedMonster}
        onClose={() => setSelectedMonster(null)}
        title={selectedMonster?.name ?? 'Stat Block'}
        width="max-w-xl"
      >
        {selectedMonster && <StatBlockPanel monster={selectedMonster} />}
      </SlideOver>
    </>
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
