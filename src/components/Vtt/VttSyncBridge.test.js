import { describe, it, expect, beforeEach } from 'vitest'
import { EventBus } from '../../vtt/canvas/EventBus.js'
import { createSyncBridge } from './VttSyncBridge.js'

/* Minimal mock canvas: the bridge only needs these to wire up. */
function mockCanvas() {
  const controller = {
    userId: null,
    actorMap: new Map(), itemMap: new Map(),
    invalidateLighting() {}, refreshLighting() {},
    syncViewpointToOwnedTokens() {}, syncViewpointToAllVisionTokens() {},
    _spatialIndex: { invalidate() {} },
  }
  const scene = { getToken: () => null, getWall: () => null, getTemplate: () => null,
    removeToken() {}, addToken() {}, tiles: [], id: 'scene1', toJSON: () => ({ id: 'scene1' }) }
  return { controller, scene, renderer: { removeToken() {} }, addToken() {} }
}

function mockSceneManager() {
  const userScenes = new Map()
  return {
    userScenes,
    switched: [],
    scenes: [],
    activeScene: { id: 'scene1' },
    setUserScene(userId, sceneId) { userScenes.set(userId, sceneId) },
    removeUser(userId) { userScenes.delete(userId) },
    switchScene(sceneId) { this.switched.push(sceneId) },
    moveAllUsersToScene(sceneId) {
      for (const k of [...userScenes.keys()]) userScenes.set(k, sceneId)
    },
  }
}

describe('VttSyncBridge — inbound record application', () => {
  let bus, canvas, destroy

  beforeEach(() => {
    bus = new EventBus()
    canvas = mockCanvas()
    destroy = createSyncBridge(canvas, bus)
  })

  it('caches created items and notifies items-changed', () => {
    let changed = 0
    bus.on('items-changed', () => changed++)
    bus.emitRecord('item', 'created', { id: 'i1', actorId: 'a1', name: 'Rapier' }, undefined, 'remote')
    expect(canvas.controller.itemMap.get('i1').name).toBe('Rapier')
    expect(changed).toBe(1)
    destroy()
  })

  it('merges item updates into the cache', () => {
    bus.emitRecord('item', 'created', { id: 'i1', actorId: 'a1', name: 'Rapier', equipped: false }, undefined, 'remote')
    bus.emitRecord('item', 'updated', { id: 'i1', equipped: true }, undefined, 'remote')
    const it = canvas.controller.itemMap.get('i1')
    expect(it.equipped).toBe(true)
    expect(it.name).toBe('Rapier')
    destroy()
  })

  it('does not attach verb methods to the controller (GameActions owns verbs)', () => {
    expect(canvas.controller.equipItem).toBeUndefined()
    expect(canvas.controller.transferItem).toBeUndefined()
    destroy()
  })

  it('leaves gesture callbacks callable (no-ops) after destroy', () => {
    destroy()
    expect(() => canvas.controller.onTokenDragEnd({ id: 't1' })).not.toThrow()
    expect(() => canvas.controller.onWallCreated({ id: 'w1' })).not.toThrow()
  })
})

describe('VttSyncBridge — remote scene ephemerals', () => {
  it('applies remote scene:move-all-users: reassigns users, switches, announces self', () => {
    const bus = new EventBus()
    const canvas = mockCanvas()
    canvas.controller.userId = 'me'
    canvas.sceneManager = mockSceneManager()
    canvas.sceneManager.userScenes.set('u1', 'sceneOld')
    const outbound = []
    bus.on('ephemeral', (e) => { if (e.origin !== 'remote') outbound.push(e) })
    const destroy = createSyncBridge(canvas, bus)

    bus.emitEphemeral('scene:move-all-users', { sceneId: 's2', fromUserId: 'dm-user' }, 'remote')

    expect(canvas.sceneManager.userScenes.get('u1')).toBe('s2')
    expect(canvas.sceneManager.userScenes.get('me')).toBe('s2')
    expect(canvas.sceneManager.switched).toContain('s2')
    /* announces own presence exactly once for the pull */
    const presence = outbound.filter(e => e.type === 'scene:user-presence' && e.sceneId === 's2')
    expect(presence).toHaveLength(1)
    destroy()
  })

  it('applies remote scene:switched (DM activation) and follows', () => {
    const bus = new EventBus()
    const canvas = mockCanvas()
    canvas.controller.userId = 'me'
    canvas.sceneManager = mockSceneManager()
    const destroy = createSyncBridge(canvas, bus)

    bus.emitEphemeral('scene:switched', { sceneId: 's9', fromUserId: 'dm' }, 'remote')
    expect(canvas.sceneManager.switched).toContain('s9')
    expect(canvas.sceneManager.userScenes.get('me')).toBe('s9')
    destroy()
  })

  it('ignores locally-originated scene ephemerals (GameActions already applied them)', () => {
    const bus = new EventBus()
    const canvas = mockCanvas()
    canvas.sceneManager = mockSceneManager()
    const destroy = createSyncBridge(canvas, bus)

    bus.emitEphemeral('scene:switched', { sceneId: 's9' })          // origin 'local'
    bus.emitEphemeral('scene:move-all-users', { sceneId: 's9' })    // origin 'local'
    expect(canvas.sceneManager.switched).not.toContain('s9')
    destroy()
  })

  it('tracks remote scene:user-presence on the ephemeral channel', () => {
    const bus = new EventBus()
    const canvas = mockCanvas()
    canvas.sceneManager = mockSceneManager()
    const destroy = createSyncBridge(canvas, bus)

    bus.emitEphemeral('scene:user-presence', { userId: 'u7', sceneId: 's3', fromUserId: 'u7' }, 'remote')
    expect(canvas.sceneManager.userScenes.get('u7')).toBe('s3')
    destroy()
  })
})

describe('VttSyncBridge — presence roster sync', () => {
  it('seeds, updates, and prunes userScenes from the server roster', () => {
    const bus = new EventBus()
    const canvas = mockCanvas()
    canvas.sceneManager = mockSceneManager()
    canvas.sceneManager.userScenes.set('gone', 'sceneX')
    const destroy = createSyncBridge(canvas, bus)

    bus.emit('presence', { users: [
      { userId: 'u1', sceneId: 's2' },
      { userId: 'u2' },                       // no sceneId -> defaults to active
    ] })

    expect(canvas.sceneManager.userScenes.get('u1')).toBe('s2')
    expect(canvas.sceneManager.userScenes.get('u2')).toBe('scene1')
    expect(canvas.sceneManager.userScenes.has('gone')).toBe(false)  // pruned
    destroy()
  })
})
