const G = '#c9a84c'
function svg(inner) {
  const s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" stroke="${G}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`
  return 'data:image/svg+xml,' + encodeURIComponent(s)
}

export const ICONS = {
  sword: svg('<path d="M46 12 30 28l-3 6 6-3 16-16z"/><path d="M50 8l6 6"/><path d="M27 34l-4 4"/><path d="M20 40l8 8"/><path d="M18 46l-6 6"/>'),
  dagger: svg('<path d="M40 14 26 28l-2 5 5-2 14-14z"/><path d="M24 33l-3 3"/><path d="M20 39l6 6"/><path d="M18 43l-4 4"/>'),
  bow: svg('<path d="M20 12c14 8 14 32 0 40"/><path d="M20 12 20 52"/><path d="M20 12l24 20-24 20"/>'),
  arrow: svg('<path d="M14 50 50 14"/><path d="M40 14h10v10"/><path d="M14 44v6h6"/>'),
  shield: svg('<path d="M32 10 50 16v14c0 12-8 20-18 24-10-4-18-12-18-24V16z"/><path d="M32 18v28"/>'),
  armor: svg('<path d="M22 14l10 6 10-6 6 8-6 6v20H22V28l-6-6z"/><path d="M32 20v30"/>'),
  helmet: svg('<path d="M16 34a16 16 0 0132 0v6H16z"/><path d="M32 18v22"/><path d="M16 40h32v6H16z"/>'),
  gloves: svg('<path d="M24 20v14M30 18v16M36 20v14"/><path d="M22 34c-2 8 2 14 10 14s12-6 10-14"/><path d="M42 26l4-2v6"/>'),
  boots: svg('<path d="M26 12v24l-8 6v6h20v-8l-4-4V12z"/><path d="M26 36h8"/>'),
  cloak: svg('<path d="M24 12c-6 8-10 24-8 40h32c2-16-2-32-8-40"/><path d="M24 12l8 6 8-6"/><path d="M32 18v34"/>'),
  ring: svg('<circle cx="32" cy="38" r="14"/><circle cx="32" cy="20" r="6"/>'),
  amulet: svg('<path d="M20 14c4 10 8 14 12 14s8-4 12-14"/><circle cx="32" cy="40" r="10"/>'),
  potion: svg('<path d="M28 12h8v10l6 12a10 10 0 01-20 0l6-12z"/><path d="M26 14h12"/><path d="M24 36h16"/>'),
  scroll: svg('<path d="M18 18h24a4 4 0 010 8H22v20a4 4 0 01-8 0V22a4 4 0 014-4z"/><path d="M42 18a4 4 0 014 4v24"/><path d="M22 30h14M22 38h10"/>'),
  key: svg('<circle cx="22" cy="24" r="8"/><path d="M27 29 46 48"/><path d="M40 42l4 4M44 38l4 4"/>'),
  gem: svg('<path d="M20 24h24l-6-8H26z"/><path d="M20 24l12 24 12-24"/><path d="M26 16l6 8 6-8M20 24h24"/>'),
  backpack: svg('<path d="M22 22a10 10 0 0120 0v26a4 4 0 01-4 4H26a4 4 0 01-4-4z"/><path d="M28 22v-4a4 4 0 018 0v4"/><path d="M22 34h20"/><path d="M30 34v8h4v-8"/>'),
  pouch: svg('<path d="M24 26c-4 4-6 12-4 18a6 6 0 006 4h12a6 6 0 006-4c2-6 0-14-4-18z"/><path d="M24 26l4-6h8l4 6"/><path d="M26 22l6 4 6-4"/>'),
  wand: svg('<path d="M18 46 44 20"/><path d="M44 20l4-4"/><path d="M50 14l1-4 3 2-2 3z"/><path d="M18 46l-3 3"/>'),
  torch: svg('<path d="M32 12c4 6 4 12 0 18-4-6-4-12 0-18z"/><path d="M28 30h8l-2 20h-4z"/>'),
  book: svg('<path d="M18 16h20a4 4 0 014 4v28H22a4 4 0 01-4-4z"/><path d="M42 20v28"/><path d="M24 24h10M24 30h10"/>'),
  coin: svg('<circle cx="32" cy="32" r="18"/><path d="M32 22v20M26 27h8a4 4 0 010 8h-8"/>'),
  rations: svg('<path d="M20 24h24v6l-4 20H24l-4-20z"/><path d="M20 30h24"/><path d="M28 24v-6h8v6"/>'),
  rope: svg('<circle cx="32" cy="32" r="18"/><circle cx="32" cy="32" r="9"/><path d="M32 14v9M32 41v9M14 32h9M41 32h9"/>'),
  wondrous: svg('<path d="M32 12l4 12 12 2-9 8 3 12-10-6-10 6 3-12-9-8 12-2z"/>'),
}

function mk(t) {
  return {
    name: 'Item', itemType: 'misc', rarity: 'common', identified: true,
    value: { gp: 0 }, weight: 0, quantity: 1, stackable: false, maxStack: null,
    slot: null, equipped: false, attunement: { required: false, attuned: false },
    effects: [], description: '',
    ...t,
  }
}

export const SEED_ITEMS = [
  mk({ name: 'Rapier', itemType: 'weapon', img: ICONS.sword, slot: 'mainHand', weight: 2, value: { gp: 25 }, weapon: { damage: '1d8', damageType: 'piercing', properties: ['finesse'] }, description: 'A slender, sharply pointed blade.' }),
  mk({ name: 'Dagger', itemType: 'weapon', img: ICONS.dagger, slot: 'mainHand', weight: 1, value: { gp: 2 }, stackable: true, maxStack: 20, weapon: { damage: '1d4', damageType: 'piercing', properties: ['finesse', 'light', 'thrown'] } }),
  mk({ name: 'Longsword', itemType: 'weapon', img: ICONS.sword, slot: 'mainHand', weight: 3, value: { gp: 15 }, weapon: { damage: '1d8', damageType: 'slashing', properties: ['versatile'] } }),
  mk({ name: 'Shortbow', itemType: 'weapon', img: ICONS.bow, slot: 'ranged', weight: 2, value: { gp: 25 }, weapon: { damage: '1d6', damageType: 'piercing', properties: ['two-handed', 'ammunition'], range: 80 } }),
  mk({ name: 'Arrows', itemType: 'ammo', img: ICONS.arrow, slot: 'ammo', weight: 0.05, value: { cp: 5 }, quantity: 20, stackable: true, maxStack: 99 }),
  mk({ name: 'Leather Armor', itemType: 'armor', img: ICONS.armor, slot: 'body', weight: 10, value: { gp: 10 }, armor: { baseAC: 11, dexCap: null, type: 'light', stealthDisadvantage: false } }),
  mk({ name: 'Studded Leather', itemType: 'armor', img: ICONS.armor, slot: 'body', weight: 13, value: { gp: 45 }, rarity: 'common', armor: { baseAC: 12, dexCap: null, type: 'light' } }),
  mk({ name: 'Chain Mail', itemType: 'armor', img: ICONS.armor, slot: 'body', weight: 55, value: { gp: 75 }, armor: { baseAC: 16, dexCap: 0, type: 'heavy', stealthDisadvantage: true } }),
  mk({ name: 'Shield', itemType: 'shield', img: ICONS.shield, slot: 'offHand', weight: 6, value: { gp: 10 }, armor: { baseAC: 2 } }),
  mk({ name: 'Helm', itemType: 'wondrous', img: ICONS.helmet, slot: 'head', weight: 3, value: { gp: 8 } }),
  mk({ name: 'Gauntlets', itemType: 'wondrous', img: ICONS.gloves, slot: 'hands', weight: 2, value: { gp: 6 } }),
  mk({ name: 'Boots of Striding', itemType: 'wondrous', img: ICONS.boots, slot: 'feet', weight: 1, value: { gp: 250 }, rarity: 'uncommon', attunement: { required: true, attuned: false }, effects: [{ id: 'bs1', target: 'speed.walk', mode: 'add', value: 10 }], description: 'Your walking speed increases by 10 ft while worn.' }),
  mk({ name: 'Cloak of Protection', itemType: 'wondrous', img: ICONS.cloak, slot: 'cloak', weight: 1, value: { gp: 500 }, rarity: 'uncommon', attunement: { required: true, attuned: false }, effects: [{ id: 'cp1', target: 'ac', mode: 'add', value: 1 }], description: '+1 AC while worn and attuned.' }),
  mk({ name: 'Ring of Protection', itemType: 'ring', img: ICONS.ring, slot: 'ring', weight: 0, value: { gp: 3500 }, rarity: 'rare', attunement: { required: true, attuned: false }, effects: [{ id: 'rp1', target: 'ac', mode: 'add', value: 1 }] }),
  mk({ name: 'Signet Ring', itemType: 'ring', img: ICONS.ring, slot: 'ring', weight: 0, value: { gp: 5 } }),
  mk({ name: 'Amulet of Darkvision', itemType: 'wondrous', img: ICONS.amulet, slot: 'neck', weight: 0, value: { gp: 300 }, rarity: 'uncommon', effects: [{ id: 'ad1', target: 'senses.darkvision', mode: 'max', value: 60 }], description: 'Grants darkvision out to 60 ft.' }),
  mk({ name: 'Pendant', itemType: 'wondrous', img: ICONS.amulet, slot: 'neck', weight: 0, value: { gp: 25 } }),
  mk({ name: 'Potion of Healing', itemType: 'potion', img: ICONS.potion, weight: 0.5, value: { gp: 50 }, stackable: true, maxStack: 12, effects: [], description: 'Regain 2d4+2 hit points when consumed.' }),
  mk({ name: 'Potion of Greater Healing', itemType: 'potion', img: ICONS.potion, weight: 0.5, value: { gp: 150 }, rarity: 'uncommon', stackable: true, maxStack: 12, description: 'Regain 4d4+4 hit points.' }),
  mk({ name: 'Antitoxin', itemType: 'consumable', img: ICONS.potion, weight: 0, value: { gp: 50 }, stackable: true }),
  mk({ name: 'Scroll of Fireball', itemType: 'scroll', img: ICONS.scroll, weight: 0, value: { gp: 150 }, rarity: 'uncommon', stackable: true }),
  mk({ name: 'Spellbook', itemType: 'tool', img: ICONS.book, weight: 3, value: { gp: 50 } }),
  mk({ name: 'Wand of Magic Missiles', itemType: 'wondrous', img: ICONS.wand, weight: 1, value: { gp: 400 }, rarity: 'uncommon', charges: { current: 7, max: 7, recharge: 'dawn' } }),
  mk({ name: 'Backpack', itemType: 'container', img: ICONS.backpack, weight: 5, value: { gp: 2 }, container: { capacity: 30, weightless: false, collapsed: false } }),
  mk({ name: 'Belt Pouch', itemType: 'container', img: ICONS.pouch, weight: 1, value: { gp: 0.5 }, container: { capacity: 6, weightless: false, collapsed: false } }),
  mk({ name: 'Bag of Holding', itemType: 'container', img: ICONS.backpack, weight: 15, value: { gp: 4000 }, rarity: 'rare', container: { capacity: 500, weightless: true, collapsed: false }, description: 'Interior holds up to 500 lb; weighs 15 lb regardless of contents.' }),
  mk({ name: 'Torch', itemType: 'consumable', img: ICONS.torch, weight: 1, value: { cp: 1 }, quantity: 5, stackable: true, maxStack: 99 }),
  mk({ name: 'Rope (50 ft)', itemType: 'tool', img: ICONS.rope, weight: 10, value: { gp: 1 } }),
  mk({ name: 'Rations', itemType: 'consumable', img: ICONS.rations, weight: 2, value: { sp: 5 }, quantity: 5, stackable: true, maxStack: 50 }),
  mk({ name: 'Iron Key', itemType: 'misc', img: ICONS.key, weight: 0, value: { cp: 0 } }),
  mk({ name: 'Ruby', itemType: 'treasure', img: ICONS.gem, weight: 0, value: { gp: 500 }, stackable: true, rarity: 'rare' }),
  mk({ name: 'Gold Pieces', itemType: 'currency', img: ICONS.coin, weight: 0.02, value: { gp: 1 }, quantity: 50, stackable: true, maxStack: 100000 }),
  mk({ name: 'Wondrous Trinket', itemType: 'wondrous', img: ICONS.wondrous, weight: 0.5, value: { gp: 10 } }),
]

function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'item-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function seedItemsForActor(actorId, options = {}) {
  const list = options.only
    ? SEED_ITEMS.filter(i => options.only.includes(i.name))
    : SEED_ITEMS
  return list.map((tpl, i) => ({
    ...structuredClone(tpl),
    id: newId(),
    actorId,
    parentItemId: null,
    order: i,
  }))
}

export function seedItem(name, actorId, overrides = {}) {
  const tpl = SEED_ITEMS.find(i => i.name === name)
  if (!tpl) return null
  return { ...structuredClone(tpl), id: newId(), actorId, parentItemId: null, order: 0, ...overrides }
}