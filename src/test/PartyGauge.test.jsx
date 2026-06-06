import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { PartyGauge, riskFromOverall } from '../components/dnd/PartyGauge'
import { api } from '../lib/dnd/api'

vi.mock('../lib/dnd/api', () => ({
  api: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}))

const MOCK_PLAYERS = [
  { id: 'p1', name: 'Aragorn', class: 'Ranger', max_hp: 30, current_hp: 25, is_active: true, resources: [] },
  { id: 'p2', name: 'Gimli', class: 'Fighter', max_hp: 40, current_hp: 10, is_active: true, resources: [] },
]

beforeEach(() => {
  vi.clearAllMocks()
})

describe('riskFromOverall', () => {
  it('returns Well Rested above 75%', () => {
    expect(riskFromOverall(100)).toEqual({ label: 'Well Rested', color: 'ok' })
    expect(riskFromOverall(76)).toEqual({ label: 'Well Rested', color: 'ok' })
  })

  it('returns Engaged between 51-75%', () => {
    expect(riskFromOverall(75)).toEqual({ label: 'Engaged', color: 'warn' })
    expect(riskFromOverall(51)).toEqual({ label: 'Engaged', color: 'warn' })
  })

  it('returns Tested between 26-50%', () => {
    expect(riskFromOverall(50)).toEqual({ label: 'Tested', color: 'risk' })
    expect(riskFromOverall(26)).toEqual({ label: 'Tested', color: 'risk' })
  })

  it('returns Critical at or below 25%', () => {
    expect(riskFromOverall(25)).toEqual({ label: 'Critical', color: 'crit' })
    expect(riskFromOverall(0)).toEqual({ label: 'Critical', color: 'crit' })
  })
})

describe('PartyGauge HP sync', () => {
  beforeEach(() => {
    api.get
      .mockResolvedValueOnce({ players: MOCK_PLAYERS, campaign: {} })
      .mockResolvedValueOnce({ session: null })
  })

  function openPanel() {
    const toggle = screen.getByText('▴')
    fireEvent.click(toggle)
  }

  it('dispatches dnd-player-hp-changed when HP slider moves', async () => {
    api.patch.mockResolvedValue({ ok: true })
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')

    render(<PartyGauge />)
    openPanel()
    await screen.findByText('Aragorn')

    const sliders = screen.getAllByRole('slider')
    await act(async () => {
      fireEvent.change(sliders[0], { target: { value: '15' } })
    })

    expect(api.patch).toHaveBeenCalledWith('/api/dnd/players', { id: 'p1', current_hp: 15 })

    const hpEvent = dispatchSpy.mock.calls.find(([e]) => e.type === 'dnd-player-hp-changed')
    expect(hpEvent).toBeDefined()
    expect(hpEvent[0].detail).toEqual({ playerId: 'p1', current_hp: 15 })
  })

  it('updates player state when dnd-player-hp-changed event fires from outside', async () => {
    render(<PartyGauge />)
    openPanel()
    await screen.findByText('Aragorn')

    const hpText = screen.getByText('25/30')
    expect(hpText).toBeInTheDocument()

    act(() => {
      window.dispatchEvent(new CustomEvent('dnd-player-hp-changed', {
        detail: { playerId: 'p1', current_hp: 5 }
      }))
    })

    expect(await screen.findByText('5/30')).toBeInTheDocument()
  })

  it('still dispatches event when api.patch to players fails', async () => {
    api.patch.mockRejectedValue(new Error('DB error'))
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')

    render(<PartyGauge />)
    openPanel()
    await screen.findByText('Aragorn')

    const sliders = screen.getAllByRole('slider')
    await act(async () => {
      fireEvent.change(sliders[0], { target: { value: '5' } })
    })

    const hpEvent = dispatchSpy.mock.calls.find(([e]) => e.type === 'dnd-player-hp-changed')
    expect(hpEvent).toBeDefined()
    expect(hpEvent[0].detail).toEqual({ playerId: 'p1', current_hp: 5 })
  })
})
