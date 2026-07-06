const ITEM_TYPES = [
  'weapon', 'armor', 'potion', 'scroll', 'wand', 'tool',
  'ammo', 'misc', 'container', 'shield', 'ring', 'wondrous',
]

const EQUIP_SLOTS = [
  'head', 'neck', 'shoulders', 'chest', 'hands',
  'ring1', 'ring2', 'mainHand', 'offHand', 'feet',
]

export class Item {
  constructor({
    id, name, img, quantity, description, data, actorId,
    type, containerId, weight, value, currencyType,
    equipable, equipSlot, armorClass, armorType,
    damage, weaponType, range, properties,
    effects, consumable, maxCharges, currentCharges,
    requiresAttunement, attuned,
  } = {}) {
    this.id = id ?? crypto.randomUUID()
    this.name = name ?? 'New Item'
    this.img = img ?? ''
    this.quantity = quantity ?? 1
    this.description = description ?? ''
    this.data = data ?? {}
    this.actorId = actorId ?? null

    this.type = ITEM_TYPES.includes(type) ? type : 'misc'
    this.containerId = containerId ?? null
    this.weight = weight ?? 0
    this.value = value ?? 0
    this.currencyType = currencyType ?? 'gp'

    this.equipable = equipable ?? false
    this.equipSlot = EQUIP_SLOTS.includes(equipSlot) ? equipSlot : null
    this.armorClass = armorClass ?? null
    this.armorType = armorType ?? null

    this.damage = damage ?? null
    this.weaponType = weaponType ?? null
    this.range = range ?? null
    this.properties = properties ?? []

    this.effects = effects ?? []
    this.consumable = consumable ?? false
    this.maxCharges = maxCharges ?? null
    this.currentCharges = currentCharges ?? null

    this.requiresAttunement = requiresAttunement ?? false
    this.attuned = attuned ?? false
  }

  get isContainer() {
    return this.type === 'container'
  }

  toJSON() {
    return {
      type: 'item',
      id: this.id,
      name: this.name,
      img: this.img,
      quantity: this.quantity,
      description: this.description,
      data: this.data,
      actorId: this.actorId,
      itemType: this.type,
      containerId: this.containerId,
      weight: this.weight,
      value: this.value,
      currencyType: this.currencyType,
      equipable: this.equipable,
      equipSlot: this.equipSlot,
      armorClass: this.armorClass,
      armorType: this.armorType,
      damage: this.damage,
      weaponType: this.weaponType,
      range: this.range,
      properties: this.properties,
      effects: this.effects,
      consumable: this.consumable,
      maxCharges: this.maxCharges,
      currentCharges: this.currentCharges,
      requiresAttunement: this.requiresAttunement,
      attuned: this.attuned,
    }
  }
}
