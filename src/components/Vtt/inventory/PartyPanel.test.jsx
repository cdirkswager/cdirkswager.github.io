import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import PartyPanel from './PartyPanel.jsx'

const makeBus = () => ({ on: () => () => {}, emit: () => {} })

function build() {
  const actorMap = new Map()
  const itemMap = new Map()
  actorMap.set('c1', {
    id: 'c1', name: 'Lyra', actorType: 'character', ownership: { default: 'none', users: { u1: 'owner' } },
    attributes: { biography: { class: 'Rogue', level: 5 }, abilities: { dex: 18 }, ac: { base: 10 }, hp: { current: 20, max: 38, temp: 4 }, conditions: ['poisoned'] },
  })
  actorMap.set('c2', {
    id: 'c2', name: 'Thane', actorType: 'character', ownership: { default: 'none', users: { u2: 'owner' } },
    attributes: { biography: { class: 'Fighter', level: 5 }, abilities: { dex: 12 }, ac: { base: 16 }, hp: { current: 42, max: 42 } },
  })
  actorMap.set('n1', { id: 'n1', name: 'Goblin', actorType: 'npc', ownership: { default: 'none', users: {} }, attributes: { hp: { current: 7, max: 7 } } })
  return { controller: { actorMap, itemMap } }
}

describe('PartyPanel', () => {
  it('shows characters with HP and conditions', () => {
    const { controller } = build()
    render(<PartyPanel controller={controller} eventBus={makeBus()} session={{ userId: 'u1', role: 'player' }} onSelect={() => {}} onClose={() => {}} />)
    expect(screen.getByText('Lyra')).toBeInTheDocument()
    expect(screen.getByText('Thane')).toBeInTheDocument()
    expect(screen.getByText('20/38 (+4)')).toBeInTheDocument()
    expect(screen.getByText('poisoned')).toBeInTheDocument()
  })

  it('hides NPCs from players but shows them to the DM', () => {
    const { controller } = build()
    const { rerender } = render(<PartyPanel controller={controller} eventBus={makeBus()} session={{ userId: 'u1', role: 'player' }} onSelect={() => {}} onClose={() => {}} />)
    expect(screen.queryByText('Goblin')).not.toBeInTheDocument()
    rerender(<PartyPanel controller={controller} eventBus={makeBus()} session={{ userId: 'dm', role: 'dm' }} onSelect={() => {}} onClose={() => {}} />)
    expect(screen.getByText('Goblin')).toBeInTheDocument()
  })

  it('clicking a member requests opening their sheet', () => {
    const { controller } = build()
    const onSelect = vi.fn()
    render(<PartyPanel controller={controller} eventBus={makeBus()} session={{ userId: 'u1', role: 'player' }} onSelect={onSelect} onClose={() => {}} />)
    fireEvent.click(screen.getByTitle("Open Lyra's sheet"))
    expect(onSelect).toHaveBeenCalledWith('c1')
  })

  it('derives AC from base + dex (unarmored)', () => {
    const { controller } = build()
    render(<PartyPanel controller={controller} eventBus={makeBus()} session={{ userId: 'u1', role: 'player' }} onSelect={() => {}} onClose={() => {}} />)
    // Lyra: 10 + dex mod 4 = 14
    expect(screen.getByText('14')).toBeInTheDocument()
  })
})
