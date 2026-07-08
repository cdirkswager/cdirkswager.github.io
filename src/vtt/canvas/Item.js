import { DEFAULT_ATTUNEMENT_MAX } from '../data/fivee.js'

export class Item {
  constructor(opts = {}) {
    const {
      id, name, img, quantity, description, data, actorId,
      itemType, rarity, identified, value, weight, stackable, maxStack,
      parentItemId, order, slot, equipped, equippedSlot, attunement, effects,
      weapon, armor, charges, container,
    } = opts

    this.id = id ?? crypto.randomUUID()
    this.name = name ?? 'New Item'
    this.img = img ?? ''
    this.description = description ?? ''
    this.actorId = actorId ?? null

    this.itemType = itemType ?? 'misc'
    this.rarity = rarity ?? 'common'
    this.identified = identified ?? true
    this.value = value ?? { gp: 0 }

    this.quantity = quantity ?? 1
    this.weight = weight ?? 0
    this.stackable = stackable ?? false
    this.maxStack = maxStack ?? null

    this.parentItemId = parentItemId ?? null
    this.order = order ?? 0

    this.slot = slot ?? null
    this.equipped = equipped ?? false
    this.equippedSlot = equippedSlot ?? null
    this.attunement = attunement ?? { required: false, attuned: false }

    this.effects = effects ?? []
    if (weapon) this.weapon = weapon
    if (armor) this.armor = armor
    if (charges) this.charges = charges
    if (container) this.container = container

    this.data = data ?? {}
  }

  get isContainer() {
    return this.itemType === 'container' && !!this.container
  }

  toJSON() {
    const out = {
      type: 'item',
      id: this.id,
      name: this.name,
      img: this.img,
      description: this.description,
      actorId: this.actorId,
      itemType: this.itemType,
      rarity: this.rarity,
      identified: this.identified,
      value: this.value,
      quantity: this.quantity,
      weight: this.weight,
      stackable: this.stackable,
      maxStack: this.maxStack,
      parentItemId: this.parentItemId,
      order: this.order,
      slot: this.slot,
      equipped: this.equipped,
      equippedSlot: this.equippedSlot,
      attunement: this.attunement,
      effects: this.effects,
      data: this.data,
    }
    if (this.weapon) out.weapon = this.weapon
    if (this.armor) out.armor = this.armor
    if (this.charges) out.charges = this.charges
    if (this.container) out.container = this.container
    return out
  }
}

export { DEFAULT_ATTUNEMENT_MAX }
