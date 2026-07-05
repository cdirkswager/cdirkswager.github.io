export class Item {
  constructor({ id, name, img, quantity, description, data, actorId } = {}) {
    this.id = id ?? crypto.randomUUID()
    this.name = name ?? 'New Item'
    this.img = img ?? ''
    this.quantity = quantity ?? 1
    this.description = description ?? ''
    this.data = data ?? {}
    this.actorId = actorId ?? null
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
    }
  }
}
