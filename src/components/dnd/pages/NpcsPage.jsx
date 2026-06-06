import { useState, useEffect } from 'react'
import { api } from '../../../lib/dnd/api'
import { SlideOver } from '../SlideOver'

export function NpcsPage() {
  const [npcs, setNpcs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('')
  const [selectedNpc, setSelectedNpc] = useState(null)
  const [editForm, setEditForm] = useState(null)
  const [notes, setNotes] = useState([])
  const [newNote, setNewNote] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ name: '', type: '', description: '', location: '' })

  const loadNpcs = async () => {
    setLoading(true)
    try {
      const data = await api.get('/api/dnd/npcs')
      setNpcs(data.npcs || data || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadNpcs() }, [])

  const filtered = filter
    ? npcs.filter((n) => {
        const q = filter.toLowerCase()
        return n.name.toLowerCase().includes(q)
          || (n.type && n.type.toLowerCase().includes(q))
          || (n.location && n.location.toLowerCase().includes(q))
      })
    : npcs

  const selectNpc = async (npc) => {
    setSelectedNpc(npc)
    setEditForm({ name: npc.name, type: npc.type || '', description: npc.description || '', location: npc.location || '' })
    try {
      const n = await api.get(`/api/dnd/npcs?id=${npc.id}`)
      setNotes(n.notes || [])
    } catch {
      setNotes([])
    }
  }

  const updateNpc = async () => {
    if (!selectedNpc) return
    try {
      await api.patch('/api/dnd/npcs', { id: selectedNpc.id, ...editForm })
      setSelectedNpc((prev) => ({ ...prev, ...editForm }))
      setNpcs((prev) => prev.map((n) => (n.id === selectedNpc.id ? { ...n, ...editForm } : n)))
    } catch (err) {
      setError(err.message)
    }
  }

  const deleteNpc = async (id) => {
    try {
      await api.del(`/api/dnd/npcs?id=${id}`)
      setNpcs((prev) => prev.filter((n) => n.id !== id))
      if (selectedNpc?.id === id) setSelectedNpc(null)
    } catch (err) {
      setError(err.message)
    }
  }

  const addNote = async () => {
    if (!newNote.trim() || !selectedNpc) return
    try {
      await api.patch('/api/dnd/npcs', { id: selectedNpc.id, _note: newNote })
      setNotes((prev) => [{ id: Date.now(), text: newNote, created_at: Date.now() }, ...prev])
      setNewNote('')
    } catch (err) {
      setError(err.message)
    }
  }

  const createNpc = async (e) => {
    e.preventDefault()
    if (!createForm.name.trim()) return
    try {
      await api.post('/api/dnd/npcs', createForm)
      await loadNpcs()
      setCreateForm({ name: '', type: '', description: '', location: '' })
      setShowCreate(false)
    } catch (err) {
      setError(err.message)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-sm text-dim">Loading NPCs...</div>
    )

  return (
      <div className="flex items-center justify-between">
        <h1 className="display text-lg font-bold text-accent">NPCs</h1>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="rounded bg-panel-2 px-3 py-1.5 text-xs font-medium text-dim hover:text-fg"
        >
          {showCreate ? 'Cancel' : '+ New NPC'}
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded border border-crit/30 bg-crit/5 px-4 py-2 text-xs text-crit">{error}</div>
      )}

      {showCreate && (
        <form onSubmit={createNpc} className="mt-4 rounded border border-line bg-panel p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Name" value={createForm.name} onChange={(v) => setCreateForm((f) => ({ ...f, name: v }))} required />
            <Input label="Type" value={createForm.type} onChange={(v) => setCreateForm((f) => ({ ...f, type: v }))} />
            <Input label="Location" value={createForm.location} onChange={(v) => setCreateForm((f) => ({ ...f, location: v }))} />
          </div>
          <div className="mt-3">
            <label className="block text-xs text-dim">Description</label>
            <textarea
              className="mt-1 w-full rounded border border-line bg-ink px-3 py-2 text-sm outline-none focus:border-accent"
              rows={3}
              value={createForm.description}
              onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="mt-4 flex justify-end">
            <button type="submit" className="rounded bg-accent px-5 py-2 text-sm font-bold text-ink hover:brightness-110">
              Create NPC
            </button>
          </div>
        </form>
      )}

      <div className="mt-4">
        <input
          className="w-full rounded border border-line bg-panel px-4 py-2 text-sm outline-none placeholder:text-dim focus:border-accent"
          placeholder="Filter by name, type, or location..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_360px]">
        <div className="space-y-1">
          {filtered.length === 0 && (
            <div className="py-12 text-center text-sm text-dim">
              {filter ? 'No NPCs match the filter.' : 'No NPCs created yet.'}
            </div>
          )}
          {filtered.map((n) => (
            <button
              key={n.id}
              onClick={() => selectNpc(n)}
              className={`flex w-full items-center gap-3 rounded border px-4 py-2.5 text-left transition-colors ${
                selectedNpc?.id === n.id ? 'border-accent bg-accent-soft' : 'border-line bg-panel hover:border-accent/30'
              }`}
            >
              <span className="flex-1 min-w-0">
                <span className="text-sm font-medium">{n.name}</span>
                {n.type && <span className="ml-2 text-[10px] text-dim uppercase">{n.type}</span>}
              </span>
              {n.location && <span className="text-xs text-dim">{n.location}</span>}
            </button>
          ))}
        </div>

        <SlideOver
          open={!!selectedNpc}
          onClose={() => setSelectedNpc(null)}
          title={selectedNpc?.name ?? 'NPC Detail'}
          width="max-w-md"
        >
          {selectedNpc && (
            <div className="space-y-4">
              <div className="space-y-3">
                <Input
                  label="Name"
                  value={editForm?.name ?? ''}
                  onChange={(v) => setEditForm((f) => f ? { ...f, name: v } : f)}
                />
                <Input
                  label="Type"
                  value={editForm?.type ?? ''}
                  onChange={(v) => setEditForm((f) => f ? { ...f, type: v } : f)}
                />
                <Input
                  label="Location"
                  value={editForm?.location ?? ''}
                  onChange={(v) => setEditForm((f) => f ? { ...f, location: v } : f)}
                />
                <div>
                  <label className="block text-xs text-dim">Description</label>
                  <textarea
                    className="mt-1 w-full rounded border border-line bg-ink px-3 py-2 text-sm outline-none focus:border-accent"
                    rows={4}
                    value={editForm?.description ?? ''}
                    onChange={(e) => setEditForm((f) => f ? { ...f, description: e.target.value } : f)}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={updateNpc}
                    className="rounded bg-accent px-4 py-1.5 text-xs font-bold text-ink hover:brightness-110"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => deleteNpc(selectedNpc.id)}
                    className="rounded border border-crit/30 px-4 py-1.5 text-xs text-crit hover:bg-crit/10"
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div className="border-t border-line pt-4">
                <h3 className="text-xs font-medium uppercase tracking-wide text-accent">Quicknotes</h3>
                <div className="mt-2 flex gap-2">
                  <input
                    className="flex-1 rounded border border-line bg-ink px-3 py-1.5 text-xs outline-none focus:border-accent"
                    placeholder="Add a note..."
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addNote()}
                  />
                  <button
                    onClick={addNote}
                    className="rounded bg-panel-2 px-3 py-1.5 text-xs text-dim hover:text-fg"
                  >
                    + Add
                  </button>
                </div>
                <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
                  {notes.length === 0 && (
                    <p className="text-xs text-dim">No notes yet.</p>
                  )}
                  {notes.map((note, i) => (
                    <div key={note.id || i} className="rounded border border-line bg-ink px-3 py-2">
                      <p className="text-xs text-dim">{note.text}</p>
                      {note.created_at && (
                        <p className="mt-1 text-[10px] text-dim">{new Date(note.created_at).toLocaleString()}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </SlideOver>
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
