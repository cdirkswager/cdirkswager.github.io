import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../../../lib/dnd/api'
import { CombatantRow } from '../CombatantRow'
import { StatBlockPanel } from '../StatBlockPanel'
import { SlideOver } from '../SlideOver'

export function CombatPage() {
  const [params] = useSearchParams()
  const [session, setSession] = useState(null)
  const [combatants, setCombatants] = useState([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [statBlockMonster, setStatBlockMonster] = useState(null)
  const [partyReport, setPartyReport] = useState(null)
  const addingRef = useRef(false)

  const sessionId = params.get('sessionId') || session?.id

  const loadCombat = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.get('/api/dnd/combat')
      setSession(data.session)
      setCombatants(data.combatants || [])
      setPartyReport(data.gauge || null)
      setCurrentIdx(0)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadCombat() }, [loadCombat])

  useEffect(() => {
    const handle = () => loadCombat()
    window.addEventListener('dnd-combatants-changed', handle)
    return () => window.removeEventListener('dnd-combatants-changed', handle)
  }, [loadCombat])
  useEffect(() => {
    const handle = (e) => {
      const { playerId, current_hp } = e.detail
      setCombatants((prev) =>
        prev.map((c) =>
          c.is_player && c.player_id === playerId ? { ...c, hp_current: current_hp } : c
        )
      )
    }
    window.addEventListener('dnd-player-hp-changed', handle)
    return () => window.removeEventListener('dnd-player-hp-changed', handle)
  }, [])

  const addActivePlayersToCombat = async (sessionId) => {
    if (addingRef.current) return
    addingRef.current = true
    try {
      const data = await api.get('/api/dnd/players')
      const activePlayers = (data.players || []).filter((p) => p.is_active)
      const existingPlayerIds = new Set(combatants.filter((c) => c.is_player).map((c) => c.player_id))
      for (const p of activePlayers) {
        if (existingPlayerIds.has(p.id)) continue
        await api.post('/api/dnd/combat/combatants', {
          combat_session_id: sessionId,
          source: 'player',
          ref_id: p.id,
        })
      }
      await loadCombat()
    } catch { } finally {
      addingRef.current = false
    }
  }

  const startNewCombat = async () => {
    try {
      const result = await api.post('/api/dnd/combat', {})
      await loadCombat()
      if (result.id) await addActivePlayersToCombat(result.id)
      window.dispatchEvent(new Event('dnd-combatants-changed'))
    } catch (err) {
      setError(err.message)
    }
  }

  useEffect(() => {
    if (session?.id && combatants.length === 0 && !addingRef.current) {
      addActivePlayersToCombat(session.id)
    }
  }, [session?.id])

  const endCombat = async () => {
    if (!session?.id) return
    try {
      await api.patch('/api/dnd/combat', { id: session.id, state: 'ended' })
      await loadCombat()
    } catch (err) {
      setError(err.message)
    }
  }

  const removeCombatant = async (combatantId) => {
    if (!session?.id) return
    await api.del(`/api/dnd/combat/combatants?id=${combatantId}`)
    setCombatants((prev) => prev.filter((c) => c.id !== combatantId))
  }

  const updateCombatant = async (combatantId, updates) => {
    if (!session?.id) return
    await api.patch(`/api/dnd/combat/combatants`, { id: combatantId, ...updates })
    let playerId = null
    setCombatants((prev) =>
      prev.map((c) => {
        if (c.id !== combatantId) return c
        if (c.is_player && c.player_id && updates.hp_current !== undefined) playerId = c.player_id
        return { ...c, ...updates }
      })
    )
    if (playerId && updates.hp_current !== undefined) {
      await api.patch('/api/dnd/players', { id: playerId, current_hp: updates.hp_current })
      window.dispatchEvent(new CustomEvent('dnd-player-hp-changed', {
        detail: { playerId, current_hp: updates.hp_current }
      }))
    }
  }

  const refreshReport = async () => {
    try {
      const data = await api.get('/api/dnd/combat')
      setPartyReport(data.gauge || null)
    } catch { }
  }

  useEffect(() => { if (session?.id) refreshReport() }, [session])

  const sorted = [...combatants].sort((a, b) => b.initiative - a.initiative)
  const current = sorted[currentIdx]

  const nextTurn = () => {
    if (currentIdx < sorted.length - 1) setCurrentIdx((i) => i + 1)
    else setCurrentIdx(0)
  }

  const prevTurn = () => {
    if (currentIdx > 0) setCurrentIdx((i) => i - 1)
    else setCurrentIdx(sorted.length - 1)
  }

  const viewStatBlock = async (c) => {
    if (!c.monster_id) return
    const data = await api.get(`/api/dnd/monsters?id=${c.monster_id}`)
    setStatBlockMonster(data)
  }

  const convertToNpc = async (c) => {
    if (!c.monster_id || !session?.id) return
    const npc = await api.post('/api/dnd/npcs', {
      name: c.display_name,
      monster_id: c.monster_id,
    })
    await api.patch(`/api/dnd/combat/combatants`, { id: c.id, npc_id: npc.id, display_name: npc.name })
    setCombatants((prev) =>
      prev.map((x) => (x.id === c.id ? { ...x, npc_id: npc.id, display_name: npc.name } : x))
    )
  }

  const addNote = async (c) => {
    if (!c.npc_id && c.is_player) return
    const text = prompt('Quick note:')
    if (!text) return
    const targetId = c.npc_id || c.monster_id
    if (c.npc_id) {
      await api.patch('/api/dnd/npcs', { id: targetId, _note: text })
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-sm text-dim">Loading combat...</div>
    )
  }

  if (error) {
    return (
      <div className="rounded border border-crit/30 bg-crit/5 px-4 py-3 text-sm text-crit">{error}</div>
    )
  }

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <h2 className="display text-xl font-bold text-dim">No Active Combat</h2>
        <p className="mt-2 text-sm text-dim">Start a new combat session to begin tracking initiative.</p>
        <button onClick={startNewCombat} className="mt-6 rounded bg-accent px-6 py-2 text-sm font-bold text-ink hover:brightness-110">
          Start New Combat
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="display text-lg font-bold text-accent">Combat</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.dispatchEvent(new Event('dnd-open-search'))}
            className="rounded border border-line bg-panel-2 px-3 py-1.5 text-xs font-medium text-dim hover:border-accent hover:text-fg"
          >
            + Add
          </button>
          <button onClick={endCombat} className="rounded border border-crit/30 px-3 py-1.5 text-xs text-crit hover:bg-crit/10">
            End Combat
          </button>
        </div>
      </div>

      {sorted.length === 0 && (
        <div className="mt-12 text-center text-sm text-dim">
          No combatants yet. Press <kbd className="mono rounded border border-line bg-panel px-1.5 py-0.5">⌘K</kbd> to add monsters, NPCs, or players.
        </div>
      )}

      <div className="mt-4 space-y-2">
        {sorted.map((c, i) => (
          <CombatantRow
            key={c.id}
            c={c}
            isCurrent={i === currentIdx}
            onChange={(updates) => updateCombatant(c.id, updates)}
            onRemove={() => removeCombatant(c.id)}
            onViewStatBlock={() => viewStatBlock(c)}
            onConvertNpc={() => convertToNpc(c)}
            onAddNote={() => addNote(c)}
          />
        ))}
      </div>

      {sorted.length > 0 && (
        <div className="mt-6 flex items-center justify-center gap-4">
          <button
            onClick={prevTurn}
            className="rounded bg-panel-2 px-4 py-2 text-sm font-medium text-dim hover:text-fg"
          >
            ← Prev
          </button>
          <span className="display text-sm font-bold text-accent">
            Turn {currentIdx + 1} / {sorted.length}
          </span>
          <span className="text-sm text-dim">
            {current?.display_name ?? '—'}
          </span>
          <button
            onClick={nextTurn}
            className="rounded bg-accent px-4 py-2 text-sm font-bold text-ink hover:brightness-110"
          >
            Next →
          </button>
        </div>
      )}

      <SlideOver open={!!statBlockMonster} onClose={() => setStatBlockMonster(null)} title="Stat Block">
        {statBlockMonster && <StatBlockPanel monster={statBlockMonster} />}
      </SlideOver>
    </>
  )
}
