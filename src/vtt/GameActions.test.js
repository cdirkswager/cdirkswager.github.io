import { describe, it, expect, beforeEach } from 'vitest'
import { EventBus } from './canvas/EventBus.js'
import { createGameActions } from './GameActions.js'

function mockCanvas() {
  const controller = {
    userId: 'me',
    isDm: false,
    actorMap: new Map(),
    itemMap: new Map(),
  }
  const sceneManager = {
    userScenes: new Map(),
    switched: [],
    scenes: [],
    activeScene: { id: 'scene1' },
    added: [],
    removed: [],
    add(s) { this.added.push(s); this.scenes.push(s) },
    remove(id) { this.removed.push(id); this.scenes = this.scenes.filter(s => s.id !== id) },
    setUserScene(userId, sceneId) { this.userScenes.set(userId, sceneId) },
    switchScene(sceneId) { this.switched.push(sceneId) },
    moveAllUsersToScene(sceneId) {
      for (const k of [...this.userScenes.keys()]) this.userScenes.set(k, sceneId)
    },
  }
  return {
    controller,
    sceneManager,
    scene: sceneManager.activeScene,
    renderer: {},
    setLightingEnabled() {},
    refreshLighting() {},
  }
}

describe('GameActions — optimistic item mutations', () => {
  let bus, canvas, actions, sent

  beforeEach(() => {
    bus = new EventBus()
    canvas = mockCanvas()
    sent = []
    bus.on('record:changed', (e) => sent.push(e))
    actions = createGameActions({ canvas, eventBus: bus })
    canvas.controller.itemMap.set('i1', { id: 'i1', actorId: 'a1', name: 'Rapier', equipped: false, equippedSlot: null })
  })

  it('equip applies optimistically and sends with an opId, origin local', () => {
    const opId = actions.equipItem('i1', 'mainHand')
    const it = canvas.controller.itemMap.get('i1')
    expect(it.equipped).toBe(true)
    expect(it.equippedSlot).toBe('mainHand')
    const update = sent.find(e => e.action === 'updated' && e.data.id === 'i1')
    expect(update.opId).toBe(opId)
    expect(update.origin).toBe('local')
  })

  it('rolls back when the server rejects the op', () => {
    const opId = actions.equipItem('i1', 'mainHand')
    let rejected = null
    bus.on('op-rejected', (m) => { rejected = m })
    bus.emit('sync-error', { opId, message: 'Illegal equip slot' })
    const it = canvas.controller.itemMap.get('i1')
    expect(it.equipped).toBe(false)
    expect(it.equippedSlot).toBe(null)
    expect(rejected.message).toBe('Illegal equip slot')
  })

  it('does not roll back on unrelated errors', () => {
    actions.equipItem('i1', 'mainHand')
    bus.emit('sync-error', { opId: 'some-other-op', message: 'unrelated' })
    expect(canvas.controller.itemMap.get('i1').equipped).toBe(true)
  })

  it('move into a container updates parentItemId optimistically', () => {
    actions.moveItem('i1', 'pack1', { unequip: false })
    expect(canvas.controller.itemMap.get('i1').parentItemId).toBe('pack1')
  })

  it('transfer sends a transfer action with an opId but does not mutate locally', () => {
    const opId = actions.transferItem({ itemId: 'i1', toActorId: 'a2' })
    expect(canvas.controller.itemMap.get('i1').actorId).toBe('a1')
    const t = sent.find(e => e.action === 'transfer')
    expect(t.opId).toBe(opId)
    expect(t.data.toActorId).toBe('a2')
  })

  it('splitStack reduces quantity optimistically and rolls back on rejection', () => {
    canvas.controller.itemMap.set('i2', { id: 'i2', actorId: 'a1', name: 'Gold', stackable: true, quantity: 50 })
    const opId = actions.splitStack('i2', 20)
    expect(canvas.controller.itemMap.get('i2').quantity).toBe(30)
    bus.emit('sync-error', { opId, message: 'Invalid split' })
    expect(canvas.controller.itemMap.get('i2').quantity).toBe(50)
  })

  it('deleteItem removes the item optimistically and rolls back on rejection', () => {
    const opId = actions.deleteItem('i1')
    expect(canvas.controller.itemMap.has('i1')).toBe(false)
    bus.emit('sync-error', { opId, message: 'Permission denied' })
    expect(canvas.controller.itemMap.has('i1')).toBe(true)
  })

  it('setAttunement toggles optimistically, creates the object when missing, and rolls back', () => {
    canvas.controller.itemMap.set('i4', { id: 'i4', actorId: 'a1', name: 'Ring', equipped: true })
    const opId = actions.setAttunement('i4', true)
    expect(canvas.controller.itemMap.get('i4').attunement.attuned).toBe(true)
    expect(canvas.controller.itemMap.get('i4').attunement.required).toBe(false)
    bus.emit('sync-error', { opId, message: 'Cannot attune' })
    expect(canvas.controller.itemMap.get('i4').attunement ?? undefined).toBeUndefined()
  })

  it('setIdentified flips the flag optimistically', () => {
    canvas.controller.itemMap.set('i6', { id: 'i6', actorId: 'a1', name: 'Mystic Orb', identified: false })
    actions.setIdentified('i6', true)
    expect(canvas.controller.itemMap.get('i6').identified).toBe(true)
  })

  it('sync-error subscription is released on destroy', () => {
    const opId = actions.equipItem('i1', 'mainHand')
    actions.destroy()
    bus.emit('sync-error', { opId, message: 'too late' })
    expect(canvas.controller.itemMap.get('i1').equipped).toBe(true) // no rollback after destroy
  })
})

describe('GameActions — loot piles', () => {
  let bus, canvas, actions, rawSent, sent

  beforeEach(() => {
    bus = new EventBus()
    canvas = mockCanvas()
    rawSent = []
    sent = []
    bus.on('net:send', (m) => rawSent.push(m))
    bus.on('record:changed', (e) => sent.push(e))
    actions = createGameActions({ canvas, eventBus: bus })
  })

  it('string form creates a pile client-side via records (legacy path)', () => {
    const pileId = actions.createLootPile('Loot')
    expect(pileId).toBeTruthy()
    const created = sent.find(e => e.resource === 'actor' && e.action === 'created')
    expect(created.data.name).toBe('Loot')
    expect(rawSent).toHaveLength(0)
  })

  it('object form routes to the server create-loot-pile verb (drop-to-ground)', () => {
    actions.createLootPile({ x: 10, y: 20, fromItemId: 'i1', name: 'Rapier' })
    expect(rawSent).toHaveLength(1)
    expect(rawSent[0]).toMatchObject({ type: 'create-loot-pile', x: 10, y: 20, fromItemId: 'i1', name: 'Rapier' })
    expect(sent.find(e => e.resource === 'actor')).toBeUndefined()
  })
})

describe('GameActions — scene verbs', () => {
  let bus, canvas, actions, ephemerals

  beforeEach(() => {
    bus = new EventBus()
    canvas = mockCanvas()
    ephemerals = []
    bus.on('ephemeral', (e) => ephemerals.push(e))
    actions = createGameActions({ canvas, eventBus: bus })
  })

  it('viewScene switches locally and announces presence — no scene:switched broadcast', () => {
    actions.viewScene('s2')
    expect(canvas.sceneManager.switched).toContain('s2')
    expect(canvas.sceneManager.userScenes.get('me')).toBe('s2')
    const types = ephemerals.map(e => e.type)
    expect(types).toContain('scene:user-presence')
    expect(types).not.toContain('scene:switched')
  })

  it('activateScene switches, broadcasts scene:switched, and announces presence', () => {
    actions.activateScene('s3')
    expect(canvas.sceneManager.switched).toContain('s3')
    const sw = ephemerals.find(e => e.type === 'scene:switched')
    expect(sw.sceneId).toBe('s3')
    expect(sw.origin).toBe('local')
  })

  it('pullAllUsers reassigns known users and broadcasts scene:move-all-users', () => {
    canvas.sceneManager.userScenes.set('u1', 'sOld')
    actions.pullAllUsers('s4')
    expect(canvas.sceneManager.userScenes.get('u1')).toBe('s4')
    const mv = ephemerals.find(e => e.type === 'scene:move-all-users')
    expect(mv.sceneId).toBe('s4')
  })

  it('deleteScene refuses to delete the active scene', () => {
    actions.deleteScene('scene1')
    expect(canvas.sceneManager.removed).toHaveLength(0)
  })

  it('updateScene is a pure record emission (WorldStore applies it)', () => {
    const recs = []
    bus.on('record:changed', (e) => recs.push(e))
    actions.updateScene('s5', { name: 'Crypt' })
    const u = recs.find(e => e.resource === 'scene' && e.action === 'updated')
    expect(u.data).toMatchObject({ id: 's5', name: 'Crypt' })
    expect(u.origin).toBe('local')
  })
})
