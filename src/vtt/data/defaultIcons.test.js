import { describe, it, expect } from 'vitest'
import {
  defaultTokenSrc, iconTypeForActorType, lootIconTypeForItem,
  resolveTokenIconType, defaultActorPortrait, ICON_COLORS,
} from './defaultIcons.js'

describe('defaultIcons', () => {
  it('maps actor types to glyphs', () => {
    expect(iconTypeForActorType('character')).toBe('player')
    expect(iconTypeForActorType('npc')).toBe('npc')
    expect(iconTypeForActorType('loot-pile')).toBe('chest')
    expect(iconTypeForActorType('vehicle')).toBe('generic')
  })

  it('chooses coins for currency, chest otherwise', () => {
    expect(lootIconTypeForItem({ itemType: 'currency' })).toBe('coins')
    expect(lootIconTypeForItem({ itemType: 'weapon' })).toBe('chest')
    expect(lootIconTypeForItem(null)).toBe('chest')
  })

  it('token iconType overrides the actor-type default', () => {
    expect(resolveTokenIconType({ iconType: 'coins' }, 'character')).toBe('coins')
    expect(resolveTokenIconType({}, 'character')).toBe('player')
    expect(resolveTokenIconType({ iconType: 'bogus' }, 'npc')).toBe('npc')
    expect(resolveTokenIconType({}, undefined)).toBe('generic')
  })

  it('produces cached svg data-URIs', () => {
    const a = defaultTokenSrc('coins')
    expect(a).toMatch(/^data:image\/svg\+xml,/)
    expect(defaultTokenSrc('coins')).toBe(a)
    expect(defaultActorPortrait('character')).toMatch(/^data:image\/svg\+xml,/)
  })

  it('exposes ring colors for every icon type', () => {
    for (const t of ['player', 'npc', 'monster', 'chest', 'coins', 'generic']) {
      expect(typeof ICON_COLORS.ring[t]).toBe('number')
    }
  })
})
