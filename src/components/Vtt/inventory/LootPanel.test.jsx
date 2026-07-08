import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import LootPanel from './LootPanel.jsx'

function makeController(overrides = {}) {
  const actorMap = new Map()
  const itemMap = new Map()
  return {
    actorMap,
    itemMap,
    transferItem: vi.fn(),
    createLootPile: vi.fn(() => 'pile-1'),
    ...overrides,
  }
}

describe('LootPanel', () => {
  it('shows empty state when no loot piles exist', () => {
    const ctrl = makeController()
    render(<LootPanel controller={ctrl} eventBus={{ on: () => () => {} }} session={{ userId: 'u1', role: 'player' }} />)
    expect(screen.getByText(/No loot piles/)).toBeTruthy()
  })

  it('shows a loot pile with its items', () => {
    const ctrl = makeController()
    const char = { id: 'c1', name: 'Hero', actorType: 'character', ownership: { default: 'none', users: { u1: 'owner' } } }
    ctrl.actorMap.set(char.id, char)
    const pile = { id: 'p1', name: 'Treasure Chest', actorType: 'loot-pile', ownership: { default: 'owner', users: {} } }
    ctrl.actorMap.set(pile.id, pile)
    const item = { id: 'item-1', name: 'Gold Coins', img: '', weight: 0.02, quantity: 50, actorId: pile.id, stackable: true, rarity: 'common' }
    ctrl.itemMap.set(item.id, item)
    render(<LootPanel controller={ctrl} eventBus={{ on: () => () => {} }} session={{ userId: 'u1', role: 'player' }} />)
    expect(screen.getAllByText('Treasure Chest').length).toBeGreaterThan(0)
    expect(screen.getByText('Gold Coins')).toBeTruthy()
    expect(screen.getByText('50')).toBeTruthy()
  })

  it('shows Loot button for player-accessible piles', () => {
    const ctrl = makeController()
    const char = { id: 'c1', name: 'Hero', actorType: 'character', ownership: { default: 'none', users: { u1: 'owner' } } }
    ctrl.actorMap.set(char.id, char)
    const pile = { id: 'p1', name: 'Open Pile', actorType: 'loot-pile', ownership: { default: 'owner', users: {} } }
    ctrl.actorMap.set(pile.id, pile)
    const item = { id: 'item-2', name: 'Sword', img: '', weight: 3, quantity: 1, actorId: pile.id, rarity: 'common' }
    ctrl.itemMap.set(item.id, item)
    render(<LootPanel controller={ctrl} eventBus={{ on: () => () => {} }} session={{ userId: 'u1', role: 'player' }} />)
    expect(screen.getByRole('button', { name: 'Loot' })).toBeTruthy()
  })

  it('DM sees New pile button', () => {
    const ctrl = makeController()
    render(<LootPanel controller={ctrl} eventBus={{ on: () => () => {} }} session={{ userId: 'dm-1', role: 'dm' }} />)
    expect(screen.getByText('+ New pile')).toBeTruthy()
  })

  it('Player does not see New pile button', () => {
    const ctrl = makeController()
    render(<LootPanel controller={ctrl} eventBus={{ on: () => () => {} }} session={{ userId: 'u1', role: 'player' }} />)
    expect(screen.queryByText('+ New pile')).toBeNull()
  })

  it('DM sees Loot all button on non-empty pile', () => {
    const ctrl = makeController()
    const char = { id: 'c1', name: 'Hero', actorType: 'character', ownership: { default: 'none', users: { dm: 'owner' } } }
    ctrl.actorMap.set(char.id, char)
    const pile = { id: 'p1', name: 'Loot Pile', actorType: 'loot-pile', ownership: { default: 'owner', users: {} } }
    ctrl.actorMap.set(pile.id, pile)
    const item = { id: 'item-3', name: 'Gem', img: '', weight: 0, quantity: 1, actorId: pile.id, rarity: 'common' }
    ctrl.itemMap.set(item.id, item)
    render(<LootPanel controller={ctrl} eventBus={{ on: () => () => {} }} session={{ userId: 'dm', role: 'dm' }} />)
    expect(screen.getByText('Loot all')).toBeTruthy()
  })

  it('DM clicking New pile calls createLootPile', () => {
    const ctrl = makeController()
    render(<LootPanel controller={ctrl} eventBus={{ on: () => () => {} }} session={{ userId: 'dm-1', role: 'dm' }} />)
    fireEvent.click(screen.getByText('+ New pile'))
    expect(ctrl.createLootPile).toHaveBeenCalled()
  })

  it('Player clicking Loot calls transferItem', () => {
    const ctrl = makeController()
    const char = { id: 'c1', name: 'Hero', actorType: 'character', ownership: { default: 'none', users: { u1: 'owner' } } }
    ctrl.actorMap.set(char.id, char)
    const pile = { id: 'p1', name: 'Pile', actorType: 'loot-pile', ownership: { default: 'owner', users: {} } }
    ctrl.actorMap.set(pile.id, pile)
    const item = { id: 'item-4', name: 'Potion', img: '', weight: 0.5, quantity: 1, actorId: pile.id, rarity: 'common' }
    ctrl.itemMap.set(item.id, item)
    render(<LootPanel controller={ctrl} eventBus={{ on: () => () => {} }} session={{ userId: 'u1', role: 'player' }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Loot' }))
    expect(ctrl.transferItem).toHaveBeenCalledWith({ itemId: 'item-4', toActorId: char.id, quantity: null })
  })
})
