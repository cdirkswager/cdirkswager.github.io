import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { ItemCard } from './HoverCard.jsx'

describe('ItemCard', () => {
  const rapier = {
    name: 'Rapier of Warning', img: 'x', itemType: 'weapon', rarity: 'uncommon',
    weight: 2, quantity: 1, value: { gp: 320 }, identified: true,
    weapon: { damage: '1d8', damageType: 'piercing' },
    attunement: { required: true, attuned: true },
    effects: [{ target: 'initiative', mode: 'add', value: 2 }],
    description: 'You cannot be surprised.',
  }

  it('shows name, damage, effects, and attunement', () => {
    render(<ItemCard item={rapier} isDm={false} />)
    expect(screen.getByText('Rapier of Warning')).toBeInTheDocument()
    expect(screen.getByText(/1d8 piercing/)).toBeInTheDocument()
    expect(screen.getByText(/\+2 initiative/)).toBeInTheDocument()
    expect(screen.getByText(/Attuned/)).toBeInTheDocument()
    expect(screen.getByText(/You cannot be surprised/)).toBeInTheDocument()
  })

  it('masks an unidentified item for players (no effects shown)', () => {
    render(<ItemCard item={{ ...rapier, identified: false }} isDm={false} />)
    expect(screen.getByText(/Unidentified Weapon/)).toBeInTheDocument()
    expect(screen.queryByText(/\+2 initiative/)).not.toBeInTheDocument()
  })

  it('reveals an unidentified item to the DM with a flag', () => {
    render(<ItemCard item={{ ...rapier, identified: false }} isDm={true} />)
    expect(screen.getByText('Rapier of Warning')).toBeInTheDocument()
    expect(screen.getByText(/hidden from players/)).toBeInTheDocument()
  })
})
