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

/* ── Multi-scene token routing ─────────────────────────────────────
   These cover the class of bug where a client viewing scene A silently
   discarded every record belonging to scene B. */

function sceneStub(id) {
  const tokens = []
  const walls = []
  return {
    id, tokens, walls,
    ambientLight: 0, lightingEnabled: false,
    getToken: (tid) => tokens.find(t => t.id === tid) ?? null,
    addToken: (t) => tokens.push(t),
    removeToken: (tid) => { const i = tokens.findIndex(t => t.id === tid); if (i > -1) tokens.splice(i, 1) },
    getWall: (wid) => walls.find(w => w.id === wid) ?? null,
    addWall: (w) => walls.push(w),
  }
}

function multiSceneCanvas(activeId, sceneIds) {
  const scenes = new Map(sceneIds.map(id => [id, sceneStub(id)]))
  const controller = {
    userId: 'me', actorMap: new Map(), itemMap: new Map(),
    invalidateLighting() {}, refreshLighting() {},
    syncViewpointToOwnedTokens() {}, syncViewpointToAllVisionTokens() {},
    _spatialIndex: { invalidate() {} },
  }
  const sceneManager = {
    _scenes: scenes,
    get scenes() { return [...scenes.values()] },
    get activeScene() { return scenes.get(activeId) },
    userScenes: new Map(),
    setUserScene() {}, removeUser() {}, switchScene() {},
    moveAllUsersToScene() {},
  }
  const sprites = []
  return {
    controller, sceneManager,
    get scene() { return scenes.get(activeId) },
    renderer: {
      addToken: (t) => sprites.push(t.id),
      removeToken: (id) => { const i = sprites.indexOf(id); if (i > -1) sprites.splice(i, 1) },
      updateTokenPosition() {}, redrawWalls() {},
    },
    addToken() {},
    _sprites: sprites,
    _sceneStub: (id) => scenes.get(id),
  }
}

describe('VttSyncBridge — tokens belong to their own scene', () => {
  it('stores a token for a NON-active scene instead of dropping it', () => {
    const bus = new EventBus()
    const canvas = multiSceneCanvas('sceneA', ['sceneA', 'sceneB'])
    const destroy = createSyncBridge(canvas, bus)

    bus.emitRecord('token', 'created', { id: 't1', sceneId: 'sceneB', x: 5, y: 5 }, undefined, 'remote')

    // Kept on scene B's model...
    expect(canvas._sceneStub('sceneB').getToken('t1')).toBeTruthy()
    // ...but no sprite, since B isn't being viewed.
    expect(canvas._sprites).not.toContain('t1')
    // ...and it did NOT leak onto the active scene.
    expect(canvas._sceneStub('sceneA').getToken('t1')).toBeNull()
    destroy()
  })

  it('renders a token for the ACTIVE scene', () => {
    const bus = new EventBus()
    const canvas = multiSceneCanvas('sceneA', ['sceneA', 'sceneB'])
    const destroy = createSyncBridge(canvas, bus)

    bus.emitRecord('token', 'created', { id: 't2', sceneId: 'sceneA' }, undefined, 'remote')
    expect(canvas._sceneStub('sceneA').getToken('t2')).toBeTruthy()
    expect(canvas._sprites).toContain('t2')
    destroy()
  })

  it('buffers a token whose scene has not loaded yet, then flushes on scene:created', () => {
    const bus = new EventBus()
    const canvas = multiSceneCanvas('sceneA', ['sceneA'])
    const destroy = createSyncBridge(canvas, bus)

    // Token arrives before its scene (unordered replay).
    bus.emitRecord('token', 'created', { id: 't3', sceneId: 'sceneC' }, undefined, 'remote')
    expect(canvas._sceneStub('sceneA').getToken('t3')).toBeNull()  // not misfiled

    // Scene C shows up — register it, then announce it.
    canvas.sceneManager._scenes.set('sceneC', sceneStub('sceneC'))
    canvas.sceneManager.add = () => {}
    canvas.sceneManager.remove = () => {}
    bus.emitRecord('scene', 'created', { id: 'sceneC', name: 'C' }, undefined, 'remote')

    expect(canvas._sceneStub('sceneC').getToken('t3')).toBeTruthy()
    destroy()
  })

  it('updates a token that lives on a non-active scene without touching sprites', () => {
    const bus = new EventBus()
    const canvas = multiSceneCanvas('sceneA', ['sceneA', 'sceneB'])
    const destroy = createSyncBridge(canvas, bus)

    bus.emitRecord('token', 'created', { id: 't4', sceneId: 'sceneB', x: 0 }, undefined, 'remote')
    bus.emitRecord('token', 'updated', { id: 't4', sceneId: 'sceneB', x: 42 }, undefined, 'remote')
    expect(canvas._sceneStub('sceneB').getToken('t4').x).toBe(42)
    destroy()
  })

  it('deletes a token from whichever scene owns it', () => {
    const bus = new EventBus()
    const canvas = multiSceneCanvas('sceneA', ['sceneA', 'sceneB'])
    const destroy = createSyncBridge(canvas, bus)

    bus.emitRecord('token', 'created', { id: 't5', sceneId: 'sceneB' }, undefined, 'remote')
    bus.emitRecord('token', 'deleted', { id: 't5', sceneId: 'sceneB' }, undefined, 'remote')
    expect(canvas._sceneStub('sceneB').getToken('t5')).toBeNull()
    destroy()
  })
})

describe('VttSyncBridge — walls belong to their own scene', () => {
  it('does not leak a scene-B wall onto scene A', () => {
    const bus = new EventBus()
    const canvas = multiSceneCanvas('sceneA', ['sceneA', 'sceneB'])
    const destroy = createSyncBridge(canvas, bus)

    bus.emitRecord('wall', 'created', { id: 'w1', sceneId: 'sceneB', x: 0, y: 0, x2: 1, y2: 1 }, undefined, 'remote')
    expect(canvas._sceneStub('sceneB').getWall('w1')).toBeTruthy()
    expect(canvas._sceneStub('sceneA').getWall('w1')).toBeNull()
    destroy()
  })

  it('legacy walls with no sceneId adopt the active scene', () => {
    const bus = new EventBus()
    const canvas = multiSceneCanvas('sceneA', ['sceneA', 'sceneB'])
    const destroy = createSyncBridge(canvas, bus)

    bus.emitRecord('wall', 'created', { id: 'w2', x: 0, y: 0, x2: 1, y2: 1 }, undefined, 'remote')
    expect(canvas._sceneStub('sceneA').getWall('w2')).toBeTruthy()
    destroy()
  })
})
