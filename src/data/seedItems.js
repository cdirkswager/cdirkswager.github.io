import { Item } from '../vtt/canvas/Item.js'

const COLORS = {
  weapon: '#c9a84c',
  armor: '#4a7a9c',
  shield: '#5a8a6a',
  potion: '#c94c6a',
  scroll: '#8a6a4a',
  ring: '#7a6a9c',
  container: '#6a7a5a',
  misc: '#888',
}

function makeIcon(letter, color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
    <rect width="24" height="24" rx="3" fill="${color}" fill-opacity="0.3"/>
    <text x="12" y="17" text-anchor="middle" font-size="14" font-weight="700" fill="${color}" font-family="sans-serif">${letter}</text>
  </svg>`
  return 'data:image/svg+xml,' + encodeURIComponent(svg)
}

export const ITEM_CATALOG = [
  /* ── Weapons ── */
  { name: 'Dagger', type: 'weapon', weight: 1, value: 2, img: makeIcon('D', COLORS.weapon),
    description: 'A simple double-edged bladed dagger.', damage: '1d4', weaponType: 'simple',
    properties: ['finesse', 'light', 'thrown'], range: '20/60', equipable: true, equipSlot: 'mainHand' },
  { name: 'Shortsword', type: 'weapon', weight: 2, value: 10, img: makeIcon('S', COLORS.weapon),
    description: 'A short, straight-bladed sword.', damage: '1d6', weaponType: 'martial',
    properties: ['finesse', 'light'], equipable: true, equipSlot: 'mainHand' },
  { name: 'Longsword', type: 'weapon', weight: 3, value: 15, img: makeIcon('L', COLORS.weapon),
    description: 'A versatile longsword, usable in one or two hands.', damage: '1d8', weaponType: 'martial',
    properties: ['versatile', 'd10'], equipable: true, equipSlot: 'mainHand' },
  { name: 'Greataxe', type: 'weapon', weight: 7, value: 30, img: makeIcon('G', COLORS.weapon),
    description: 'A massive two-handed axe.', damage: '1d12', weaponType: 'martial',
    properties: ['heavy', 'two-handed'], equipable: true, equipSlot: 'mainHand' },
  { name: 'Warhammer', type: 'weapon', weight: 5, value: 15, img: makeIcon('W', COLORS.weapon),
    description: 'A heavy hammer with a solid metal head.', damage: '1d8', weaponType: 'martial',
    properties: ['versatile', 'd10'], equipable: true, equipSlot: 'mainHand' },
  { name: 'Quarterstaff', type: 'weapon', weight: 4, value: 0.2, img: makeIcon('Q', COLORS.weapon),
    description: 'A simple wooden staff, useful as both a tool and weapon.', damage: '1d6', weaponType: 'simple',
    properties: ['versatile', 'd8'], equipable: true, equipSlot: 'mainHand' },
  { name: 'Handaxe', type: 'weapon', weight: 2, value: 5, img: makeIcon('H', COLORS.weapon),
    description: 'A light axe suitable for throwing.', damage: '1d6', weaponType: 'simple',
    properties: ['light', 'thrown'], range: '20/60', equipable: true, equipSlot: 'mainHand' },
  { name: 'Shortbow', type: 'weapon', weight: 2, value: 25, img: makeIcon('S', COLORS.weapon),
    description: 'A small recurve bow.', damage: '1d6', weaponType: 'simple',
    properties: ['two-handed', 'ranged'], range: '80/320', equipable: true, equipSlot: 'mainHand' },
  { name: 'Longbow', type: 'weapon', weight: 2, value: 50, img: makeIcon('L', COLORS.weapon),
    description: 'A tall bow made of flexible wood.', damage: '1d8', weaponType: 'martial',
    properties: ['heavy', 'two-handed', 'ranged'], range: '150/600', equipable: true, equipSlot: 'mainHand' },
  { name: 'Light Crossbow', type: 'weapon', weight: 5, value: 25, img: makeIcon('C', COLORS.weapon),
    description: 'A ranged weapon that fires bolts.', damage: '1d8', weaponType: 'simple',
    properties: ['two-handed', 'ranged'], range: '80/320', equipable: true, equipSlot: 'mainHand' },

  /* ── Armor ── */
  { name: 'Padded Armor', type: 'armor', weight: 8, value: 5, img: makeIcon('P', COLORS.armor),
    description: 'Quilted layers of cloth and padding.', armorClass: 11, armorType: 'light',
    properties: ['stealth-disadvantage'], equipable: true, equipSlot: 'chest' },
  { name: 'Leather Armor', type: 'armor', weight: 10, value: 10, img: makeIcon('L', COLORS.armor),
    description: 'Armor made from tough cured leather.', armorClass: 11, armorType: 'light',
    equipable: true, equipSlot: 'chest' },
  { name: 'Chain Shirt', type: 'armor', weight: 20, value: 50, img: makeIcon('C', COLORS.armor),
    description: 'A shirt of interlocking metal rings.', armorClass: 13, armorType: 'medium',
    equipable: true, equipSlot: 'chest' },
  { name: 'Chain Mail', type: 'armor', weight: 55, value: 75, img: makeIcon('M', COLORS.armor),
    description: 'A full suit of chainmail armor.', armorClass: 16, armorType: 'heavy',
    properties: ['stealth-disadvantage', 'str-13'], equipable: true, equipSlot: 'chest' },
  { name: 'Plate Armor', type: 'armor', weight: 65, value: 200, img: makeIcon('P', COLORS.armor),
    description: 'Full plate armor of interlocking metal plates.', armorClass: 18, armorType: 'heavy',
    properties: ['stealth-disadvantage', 'str-15'], equipable: true, equipSlot: 'chest' },
  { name: 'Shield', type: 'shield', weight: 6, value: 10, img: makeIcon('S', COLORS.shield),
    description: 'A wooden or metal shield worn on the arm.', armorClass: 2, armorType: 'shield',
    equipable: true, equipSlot: 'offHand', effects: [{ type: 'acBonus', value: 2, condition: 'equipped' }] },

  /* ── Potions ── */
  { name: 'Potion of Healing', type: 'potion', weight: 0.5, value: 50, img: makeIcon('H', COLORS.potion),
    description: 'Restores 2d4+2 hit points.', consumable: true, effects: [{ type: 'heal', value: '2d4+2', condition: 'onUse' }] },
  { name: 'Potion of Greater Healing', type: 'potion', weight: 0.5, value: 100, img: makeIcon('G', COLORS.potion),
    description: 'Restores 4d4+4 hit points.', consumable: true, effects: [{ type: 'heal', value: '4d4+4', condition: 'onUse' }] },
  { name: 'Potion of Climbing', type: 'potion', weight: 0.5, value: 75, img: makeIcon('C', COLORS.potion),
    description: 'Grants a climb speed for 1 hour.', consumable: true },
  { name: 'Potion of Invisibility', type: 'potion', weight: 0.5, value: 180, img: makeIcon('I', COLORS.potion),
    description: 'Grants invisibility for 1 hour.', consumable: true },

  /* ── Scrolls ── */
  { name: 'Scroll of Fireball', type: 'scroll', weight: 0, value: 150, img: makeIcon('F', COLORS.scroll),
    description: 'A fiery explosion fills a 20-ft radius.', consumable: true,
    effects: [{ type: 'damage', value: '8d6', condition: 'onUse' }] },
  { name: 'Scroll of Identify', type: 'scroll', weight: 0, value: 50, img: makeIcon('I', COLORS.scroll),
    description: 'Reveals the properties of a magic item.', consumable: true },
  { name: 'Scroll of Bless', type: 'scroll', weight: 0, value: 50, img: makeIcon('B', COLORS.scroll),
    description: 'Blesses up to three creatures.', consumable: true,
    effects: [{ type: 'statBonus', target: 'attack', value: '1d4', condition: 'onUse' }] },

  /* ── Rings ── */
  { name: 'Ring of Protection', type: 'ring', weight: 0, value: 200, img: makeIcon('P', COLORS.ring),
    description: 'A ring that grants +1 to AC and saving throws.',
    equipable: true, equipSlot: 'ring1', requiresAttunement: true,
    effects: [{ type: 'acBonus', value: 1, condition: 'equipped' }, { type: 'saveBonus', target: 'all', value: 1, condition: 'equipped' }] },
  { name: 'Ring of Mind Shielding', type: 'ring', weight: 0, value: 150, img: makeIcon('M', COLORS.ring),
    description: 'Protects from mind-reading and scrying.',
    equipable: true, equipSlot: 'ring2', requiresAttunement: true,
    effects: [{ type: 'saveBonus', target: 'wis', value: 1, condition: 'equipped' }] },

  /* ── Containers ── */
  { name: 'Backpack', type: 'container', weight: 5, value: 2, img: makeIcon('B', COLORS.container),
    description: 'A leather backpack that can hold up to 30 lb of gear.' },
  { name: 'Pouch', type: 'container', weight: 1, value: 0.5, img: makeIcon('P', COLORS.container),
    description: 'A small cloth pouch for carrying coins and small items.' },

  /* ── Misc ── */
  { name: 'Torch', type: 'misc', weight: 1, value: 0.01, img: makeIcon('T', COLORS.misc),
    description: 'A wooden torch that sheds bright light in a 20-ft radius.' },
  { name: 'Rope (50ft)', type: 'misc', weight: 10, value: 1, img: makeIcon('R', COLORS.misc),
    description: 'A 50-foot coil of hempen rope.' },
  { name: 'Rations (10 days)', type: 'misc', weight: 20, value: 5, img: makeIcon('R', COLORS.misc),
    description: 'Dried food sufficient for 10 days.' },
  { name: 'Waterskin', type: 'misc', weight: 5, value: 0.2, img: makeIcon('W', COLORS.misc),
    description: 'A leather waterskin holding about a half-gallon.' },
  { name: 'Hooded Lantern', type: 'misc', weight: 2, value: 5, img: makeIcon('L', COLORS.misc),
    description: 'A lantern that casts bright light in a 30-ft radius and dim light for 60 ft.' },
  { name: 'Gold Pieces', type: 'misc', weight: 0, value: 1, img: makeIcon('G', COLORS.misc),
    description: 'A small pouch of gold coins.', quantity: 10 },
]

export function createSeedItem(template, actorId) {
  const item = new Item({
    name: template.name,
    type: template.type,
    weight: template.weight,
    value: template.value,
    img: template.img,
    description: template.description,
    actorId,
    quantity: template.quantity ?? 1,
  })
  item.damage = template.damage ?? null
  item.weaponType = template.weaponType ?? null
  item.range = template.range ?? null
  item.properties = template.properties ?? []
  item.effects = template.effects ?? []
  item.consumable = template.consumable ?? false
  item.equipable = template.equipable ?? false
  item.equipSlot = template.equipSlot ?? null
  item.armorClass = template.armorClass ?? null
  item.armorType = template.armorType ?? null
  item.requiresAttunement = template.requiresAttunement ?? false
  return item
}

export function seedItemsForActor(eventBus, actorId) {
  if (!eventBus || !actorId) return
  for (const template of ITEM_CATALOG) {
    const item = createSeedItem(template, actorId)
    eventBus.emitRecord('item', 'created', item.toJSON())
  }
}
