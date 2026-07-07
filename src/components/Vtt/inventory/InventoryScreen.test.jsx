import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import React from 'react'
import InventoryScreen from './InventoryScreen.jsx'

/* stub EventBus: on() returns an unsubscribe */
const makeBus = () => ({ on: () => () => {}, emit: () => {} })

const character = (id, name, ownerId, extra = {}) => ({
  id, name, actorType: 'character',
  ownership: { default: 'none', users: ownerId ? { [ownerId]: 'owner' } : {} },
  attributes: {
    biography: { class: 'Rogue', subclass: 'Thief', level: 5, race: 'High Half-Elf', background: 'Charlatan', size: 'medium' },
    abilities: { str: 10, dex: 18, con: 14, int: 12, wis: 10, cha: 14 },
    hp: { current: 38, max: 38, temp: 0 }, ac: { base: 10 },
    proficiencies: { skills: ['stealth', 'perception'], savingThrows: ['dex', 'int'], weapons: [], armor: [], tools: [], languages: [] },
    currency: { gp: 1250 },
    ...extra,
  },
})
const item = (id, actorId, over = {}) => ({
  id, actorId, name: 'Item', itemType: 'misc', rarity: 'common', img: 'data:image/svg+xml,x',
  weight: 1, quantity: 1, equipped: false, parentItemId: null, order: 0, slot: null, ...over,
})

function build() {
  const actorMap = new Map()
  const itemMap = new Map()
  const lyra = character('a1', 'Lyra', 'u1')
  const thane = character('a2', 'Thane', 'u2')
  const stash = { id: 's1', name: 'Party Stash', actorType: 'party-stash', ownership: { default: 'owner', users: {} }, attributes: { currency: { gp: 40 } } }
  actorMap.set('a1', lyra); actorMap.set('a2', thane); actorMap.set('s1', stash)
  itemMap.set('i1', item('i1', 'a1', { name: 'Rapier', itemType: 'weapon', slot: 'mainHand', equipped: true, equippedSlot: 'mainHand' }))
  itemMap.set('i2', item('i2', 'a1', { name: 'Health Potion', itemType: 'potion', stackable: true, quantity: 3 }))
  itemMap.set('i3', item('i3', 's1', { name: 'Shared Gem', itemType: 'treasure', weight: 0 }))
  return { controller: { actorMap, itemMap, userId: 'u1', isDm: false } }
}

describe('InventoryScreen (read-only)', () => {
  it('renders the selected owned character with derived AC and its own items', () => {
    const { controller } = build()
    render(<InventoryScreen controller={controller} eventBus={makeBus()} session={{ userId: 'u1', role: 'player' }} onClose={() => {}} />)

    // default selection is first party member alphabetically → Lyra
    expect(screen.getAllByText('Lyra').length).toBeGreaterThan(0)
    // unarmored AC = 10 + dex(4) = 14, from EffectEngine (scope to the AC shield)
    expect(document.querySelector('.inv-ac').textContent).toContain('14')
    // her loose potion shows; the equipped rapier is on the paperdoll, not the grid
    expect(screen.getByAltText('Health Potion')).toBeInTheDocument()
    // party rail lists both characters (name is on the portrait title)
    expect(screen.getByTitle(/Thane/)).toBeInTheDocument()
  })

  it('shows the shared party stash when selecting an actor you do not own', () => {
    const { controller } = build()
    render(<InventoryScreen controller={controller} eventBus={makeBus()} session={{ userId: 'u1', role: 'player' }} onClose={() => {}} />)

    // click Thane's portrait (not owned by u1)
    fireEvent.click(screen.getByTitle(/Thane — viewing shared stash/))
    expect(screen.getByText(/Shared party stash/i)).toBeInTheDocument()
    // grid now shows the stash item, not Thane's private inventory
    expect(screen.getByAltText('Shared Gem')).toBeInTheDocument()
  })

  it('DM sees a character sheet as owner (no shared-stash fallback)', () => {
    const { controller } = build()
    controller.isDm = true
    render(<InventoryScreen controller={controller} eventBus={makeBus()} session={{ userId: 'dm', role: 'dm' }} onClose={() => {}} />)
    fireEvent.click(screen.getByTitle('Thane'))
    expect(screen.queryByText(/Shared party stash/i)).not.toBeInTheDocument()
  })

  it('calls onClose on Escape', () => {
    const { controller } = build()
    const onClose = vi.fn()
    render(<InventoryScreen controller={controller} eventBus={makeBus()} session={{ userId: 'u1', role: 'player' }} onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
