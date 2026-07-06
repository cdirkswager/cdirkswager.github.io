export class Actor {
  constructor({ id, name, img, actorType, ownership, attributes } = {}) {
    this.id = id ?? crypto.randomUUID()
    this.name = name ?? 'New Actor'
    this.img = img ?? ''
    this.actorType = actorType ?? 'character'
    this.ownership = ownership ?? { default: 'none', users: {} }
    this.attributes = attributes ?? {}
  }

  toJSON() {
    return {
      type: 'actor',
      id: this.id,
      name: this.name,
      img: this.img,
      actorType: this.actorType,
      ownership: this.ownership,
      attributes: this.attributes,
    }
  }
}
