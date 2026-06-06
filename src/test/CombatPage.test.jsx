import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { CombatPage } from '../components/dnd/pages/CombatPage'
import { api } from '../lib/dnd/api'

vi.mock('../lib/dnd/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    del: vi.fn(),
  },
}))

const MOCK_SESSION = { id: 's1', state: 'active', name: 'Test Combat' }
const MOCK_COMBATANTS = [
  { id: 'c1', player_id: 'p1', is_player: true, display_name: 'Aragorn', hp_current: 25, hp_max: 30, initiative: 18, monster_id: null, npc_id: null },
  { id: 'c2', player_id: 'p2', is_player: true, display_name: 'Gimli', hp_current: 10, hp_max: 40, initiative: 12, monster_id: null, npc_id: null },
]

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CombatPage HP sync', () => {
  beforeEach(() => {
    api.get
      .mockResolvedValueOnce({ session: MOCK_SESSION, combatants: MOCK_COMBATANTS, gauge: null })
      .mockResolvedValueOnce({ session: MOCK_SESSION, combatants: MOCK_COMBATANTS, gauge: null })
  })

  it('updates combatant HP when dnd-player-hp-changed event fires', async () => {
    render(
      <MemoryRouter>
        <CombatPage />
      </MemoryRouter>
    )

    const sliders = await screen.findAllByRole('slider')
    expect(sliders).toHaveLength(2)
    expect(sliders[0].value).toBe('25')

    act(() => {
      window.dispatchEvent(new CustomEvent('dnd-player-hp-changed', {
        detail: { playerId: 'p1', current_hp: 5 }
      }))
    })

    await vi.waitFor(() => {
      expect(sliders[0].value).toBe('5')
    })
  })

  it('still dispatches dnd-player-hp-changed even when api.patch to players fails', async () => {
    api.patch.mockResolvedValueOnce({ ok: true }).mockRejectedValueOnce(new Error('DB error'))

    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')

    render(
      <MemoryRouter>
        <CombatPage />
      </MemoryRouter>
    )

    const sliders = await screen.findAllByRole('slider')
    expect(sliders).toHaveLength(2)

    await act(async () => {
      fireEvent.change(sliders[0], { target: { value: '5' } })
    })

    await vi.waitFor(() => {
      expect(api.patch).toHaveBeenCalledTimes(2)
    })

    expect(api.patch).toHaveBeenCalledWith('/api/dnd/combat/combatants', { id: 'c1', hp_current: 5 })
    expect(api.patch).toHaveBeenCalledWith('/api/dnd/players', { id: 'p1', current_hp: 5 })

    const hpEvent = dispatchSpy.mock.calls.find(([e]) => e.type === 'dnd-player-hp-changed')
    expect(hpEvent).toBeDefined()
    expect(hpEvent[0].detail).toEqual({ playerId: 'p1', current_hp: 5 })
  })
})
