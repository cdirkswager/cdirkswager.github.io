import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { api } from '../../lib/dnd/api'

const CAT_ICON = { monster: '▤', npc: '★', player: '♔' }
const CAT_ROUTE = { monster: '/dm/dnd/monsters', npc: '/dm/dnd/npcs', player: '/dm/dnd/players' }

export function CommandPalette({ open, onClose }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [adding, setAdding] = useState(null)
  const inputRef = useRef(null)
  const navigate = useNavigate()
  const location = useLocation()
  const isCombatRoute = location.pathname.startsWith('/dm/dnd/combat')

  const flat = results
    ? Object.entries(results).flatMap(([cat, items]) => items.map((item) => ({ ...item, _cat: cat })))
    : []

  const close = useCallback(() => {
    onClose?.()
    setQuery('')
    setResults(null)
    setSelectedIdx(0)
    setAdding(null)
  }, [onClose])

  useEffect(() => {
    const down = (e) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [close])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open || query.length < 1) { setResults(null); return }
    setLoading(true)
    const timer = setTimeout(() => {
      api.get(`/api/dnd/search?q=${encodeURIComponent(query)}`).then((data) => {
        setResults(data)
        setSelectedIdx(0)
      }).catch(() => setResults({})).finally(() => setLoading(false))
    }, 200)
    return () => clearTimeout(timer)
  }, [query, open])

  const addToCombat = async (item) => {
    setAdding(item.id)
    try {
      const sessionData = await api.get('/api/dnd/combat')
      const session = sessionData.session
      if (!session) {
        alert('No active combat session. Start one first.')
        setAdding(null)
        return
      }
      const sourceMap = { monster: 'monster', npc: 'npc', player: 'player' }
      await api.post('/api/dnd/combat/combatants', {
        combat_session_id: session.id,
        source: sourceMap[item._cat] || 'custom',
        ref_id: item.id,
        quantity: 1,
      })
      window.dispatchEvent(new CustomEvent('dnd-combatants-changed'))
      close()
    } catch (err) {
      alert('Failed to add: ' + err.message)
    } finally {
      setAdding(null)
    }
  }

  const pick = (item) => {
    if (isCombatRoute) {
      addToCombat(item)
    } else {
      navigate(CAT_ROUTE[item._cat])
      close()
    }
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx((i) => Math.min(i + 1, flat.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx((i) => Math.max(i - 1, 0)) }
    if (e.key === 'Enter' && flat[selectedIdx]) pick(flat[selectedIdx])
  }

  if (!open) return null

  const grouped = results ? Object.entries(results).filter(([, items]) => items.length > 0) : []

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      <div className="absolute inset-0 bg-black/60" onClick={close} />
      <div
        className="relative w-full max-w-lg rounded-xl border border-line bg-panel shadow-2xl fadeup"
        style={{ animationDuration: '0.15s' }}
      >
        <div className="flex items-center border-b border-line px-4">
          <span className="mr-2 text-dim">⌕</span>
          <input
            ref={inputRef}
            className="flex-1 bg-transparent py-3 text-sm outline-none placeholder:text-dim"
            placeholder="Search monsters, NPCs, players..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <kbd className="mono rounded border border-line bg-ink px-1.5 py-0.5 text-[10px] text-dim">ESC</kbd>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2">
          {loading && <div className="py-8 text-center text-xs text-dim">Searching...</div>}

          {!loading && query.length > 0 && grouped.length === 0 && (
            <div className="py-8 text-center text-xs text-dim">No results</div>
          )}

          {!loading && grouped.map(([cat, items]) => (
            <div key={cat} className="mb-2">
              <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] uppercase tracking-wider text-accent">
                <span>{CAT_ICON[cat]}</span>
                <span>{cat}s</span>
                <span className="text-dim">({items.length})</span>
              </div>
              {items.map((item) => {
                const idx = flat.indexOf(item)
                return (
                  <button
                    key={item.id}
                    onClick={() => pick(item)}
                    onMouseEnter={() => setSelectedIdx(idx)}
                    disabled={adding === item.id}
                    className={`flex w-full items-center gap-3 rounded px-3 py-2 text-left text-sm transition-colors ${
                      selectedIdx === idx ? 'bg-accent-soft text-fg' : 'text-dim hover:bg-panel-2 hover:text-fg'
                    } disabled:opacity-50`}
                  >
                    <span className="w-6 text-center text-xs">{CAT_ICON[item._cat]}</span>
                    <span className="flex-1 truncate">{item.name}</span>
                    {item.cr != null && <span className="mono text-xs">CR {item.cr}</span>}
                    {item.type && <span className="rounded bg-ink px-1.5 py-0.5 text-[10px]">{item.type}</span>}
                    {isCombatRoute && (
                      <span className="mono text-[10px] text-accent">
                        {adding === item.id ? '...' : '+Combat'}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}

          {query.length === 0 && (
            <div className="py-8 text-center text-xs text-dim">
              {isCombatRoute
                ? 'Type to search and add monsters, NPCs, or players to combat'
                : 'Type to search monsters, NPCs, and players'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
