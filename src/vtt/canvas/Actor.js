import { defaultCharacterAttributes } from '../data/fivee.js'

export class Actor {
  constructor({ id, name, img, actorType, ownership, attributes } = {}) {
    this.id = id ?? crypto.randomUUID()
    this.name = name ?? 'New Actor'
    this.img = img ?? ''
    this.actorType = actorType ?? 'character'
    this.ownership = ownership ?? { default: 'none', users: {} }
    this.attributes = attributes ?? {}
  }

  static createCharacter({ name, img, ownerUserId, attributes } = {}) {
    const ownership = { default: 'none', users: {} }
    if (ownerUserId) ownership.users[ownerUserId] = 'owner'
    return new Actor({
      name: name ?? 'New Character',
      img: img ?? '',
      actorType: 'character',
      ownership,
      attributes: defaultCharacterAttributes(attributes),
    })
  }

  static createPartyStash({ name } = {}) {
    return new Actor({
      name: name ?? 'Party Stash',
      actorType: 'party-stash',
      ownership: { default: 'owner', users: {} },
      attributes: { schema: 1, currency: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 } },
    })
  }

  static createLootPile({ name } = {}) {
    return new Actor({
      name: name ?? 'Loot',
      actorType: 'loot-pile',
      ownership: { default: 'owner', users: {} },
      attributes: { schema: 1, currency: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 } },
    })
  }

  static createScenePortal({ name, sceneId } = {}) {
    return new Actor({
      name: name ?? 'Scene Portal',
      actorType: 'scene-portal',
      ownership: { default: 'owner', users: {} },
      attributes: { sceneId: sceneId ?? null },
    })
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
