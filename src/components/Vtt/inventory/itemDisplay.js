import { RARITIES } from '../../../vtt/data/fivee.js'

const TYPE_LABELS = {
  weapon: 'Weapon', armor: 'Armor', shield: 'Shield', consumable: 'Consumable',
  potion: 'Potion', scroll: 'Scroll', ammo: 'Ammunition', ring: 'Ring',
  wondrous: 'Wondrous Item', tool: 'Tool', container: 'Container',
  treasure: 'Treasure', currency: 'Currency', misc: 'Miscellaneous',
}
export const prettyType = (t) => TYPE_LABELS[t] || 'Item'

export function valueInGp(value) {
  if (!value) return 0
  const { pp = 0, gp = 0, ep = 0, sp = 0, cp = 0 } = value
  return pp * 10 + gp + ep * 0.5 + sp * 0.1 + cp * 0.01
}

export function displayItem(item, { isDm = false } = {}) {
  const unidentified = item?.identified === false
  if (unidentified && !isDm) {
    return {
      name: `Unidentified ${prettyType(item.itemType)}`,
      description: 'This item has not been identified.',
      rarity: 'common',
      showEffects: false,
      unidentified: true,
    }
  }
  return {
    name: item?.name ?? 'Item',
    description: item?.description ?? '',
    rarity: item?.rarity ?? 'common',
    showEffects: true,
    unidentified,
  }
}

const RARITY_RANK = Object.fromEntries(RARITIES.map((r, i) => [r, i]))

export function sortItems(items, key = 'manual') {
  const arr = [...(items || [])]
  const byName = (a, b) => (a.name || '').localeCompare(b.name || '')
  switch (key) {
    case 'name': arr.sort(byName); break
    case 'weight': arr.sort((a, b) => (b.weight || 0) * (b.quantity || 1) - (a.weight || 0) * (a.quantity || 1) || byName(a, b)); break
    case 'value': arr.sort((a, b) => valueInGp(b.value) * (b.quantity || 1) - valueInGp(a.value) * (a.quantity || 1) || byName(a, b)); break
    case 'type': arr.sort((a, b) => (a.itemType || '').localeCompare(b.itemType || '') || byName(a, b)); break
    case 'rarity': arr.sort((a, b) => (RARITY_RANK[b.rarity] ?? 0) - (RARITY_RANK[a.rarity] ?? 0) || byName(a, b)); break
    case 'manual':
    default: arr.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)); break
  }
  return arr
}

export const SORT_OPTIONS = [
  { key: 'manual', label: 'Custom' },
  { key: 'name', label: 'Name' },
  { key: 'type', label: 'Type' },
  { key: 'rarity', label: 'Rarity' },
  { key: 'weight', label: 'Weight' },
  { key: 'value', label: 'Value' },
]
