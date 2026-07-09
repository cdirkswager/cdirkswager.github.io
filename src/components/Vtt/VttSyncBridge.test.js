import { describe, it, expect } from 'vitest'
import { EventBus } from '../../vtt/canvas/EventBus.js'
import { createSyncBridge } from './VttSyncBridge.js'

/* The bridge is now gestures + ephemerals + presence ONLY.
   Record application is WorldStore's job (see WorldStore.test.js). */

function mockWorld(activeId = 'sceneA') {
  return {
    activeSceneId: activeId,
    viewedSceneId: activeId,
    sceneList: [],
  }
}

function mockCanvas({ isDm = false, userId = 'me' } = {}) {
  const world = mockWorld()
  const sceneManager = {
    userScenes: new Map(),
    switched: [],
    activeScene: { id: 'sceneA', gridSize: 100 },
    setUserScene(u, s) { this.userScenes.set(u, s) },
    removeUser(u) { this.userScenes.delete(u) },
    switchScene(id) { this.switched.push(id) },
  }
  const moved = []
  return {
    world,
    sceneManager,
    controller: { userId, isDm },
    renderer: { updateTokenPosition: (id, x, y) => moved.push({ id, x, y }) },
    gridSnap: true,
    _moved: moved,
  }
}

describe('VttSyncBridge — outbound gestures', () => {
  it('snaps token drag-end to the grid and emits the full record', () => {
    const bus = new EventBus()
    const canvas = mockCanvas()
    const sent = []
    bus.on('record:changed', (e) => sent.push(e))
    const destroy = createSyncBridge(canvas, bus)

    const token = { id: 't1', x: 137, y: 262, width: 100, height: 100,
      toJSON() { return { id: this.id, x: this.x, y: this.y, sceneId: 'sceneA' } } }
    canvas.controller.onTokenDragEnd(token)

    /* Snap is by token CENTER (187, 312) → cell (1, 3) → 100, 300 —
       the cell your unit is mostly standing in, tactics-style. */
    expect(token.x).toBe(100)
    expect(token.y).toBe(300)
    expect(canvas._moved[0]).toMatchObject({ id: 't1', x: 100, y: 300 })
    const rec = sent.find(e => e.resource === 'token' && e.action === 'updated')
    expect(rec.data).toMatchObject({ x: 100, y: 300, sceneId: 'sceneA' })
    destroy()
  })

  it('does not snap when gridSnap is off', () => {
    const bus = new EventBus()
    const canvas = mockCanvas()
    canvas.gridSnap = false
    const destroy = createSyncBridge(canvas, bus)
    const token = { id: 't1', x: 137, y: 262, width: 100, height: 100, toJSON() { return { id: 't1', x: this.x, y: this.y } } }
    canvas.controller.onTokenDragEnd(token)
    expect(token.x).toBe(137)
    destroy()
  })

  it('stamps sceneId on drawn walls', () => {
    const bus = new EventBus()
    const canvas = mockCanvas()
    const sent = []
    bus.on('record:changed', (e) => sent.push(e))
    const destroy = createSyncBridge(canvas, bus)
    const wall = { id: 'w1', sceneId: null, toJSON() { return { id: 'w1', sceneId: this.sceneId } } }
    canvas.controller.onWallCreated(wall)
    expect(wall.sceneId).toBe('sceneA')
    expect(sent[0].data.sceneId).toBe('sceneA')
    destroy()
  })
})

describe('VttSyncBridge — remote scene verbs & presence', () => {
  it('follows remote scene:switched / move-all and announces itself; ignores local-origin', () => {
    const bus = new EventBus()
    const canvas = mockCanvas()
    canvas.sceneManager.userScenes.set('u1', 'old')
    const outbound = []
    bus.on('ephemeral', (e) => { if (e.origin !== 'remote') outbound.push(e) })
    const destroy = createSyncBridge(canvas, bus)

    bus.emitEphemeral('scene:switched', { sceneId: 'sX' })                       // local → ignored
    expect(canvas.sceneManager.switched).not.toContain('sX')

    bus.emitEphemeral('scene:move-all-users', { sceneId: 's2', fromUserId: 'dm' }, 'remote')
    expect(canvas.sceneManager.userScenes.get('u1')).toBe('s2')
    expect(canvas.sceneManager.switched).toContain('s2')
    destroy()
  })

  it('announces own presence whenever this client switches scene', () => {
    const bus = new EventBus()
    const canvas = mockCanvas()
    const presence = []
    bus.on('ephemeral', (e) => { if (e.type === 'scene:user-presence' && e.origin !== 'remote') presence.push(e) })
    const destroy = createSyncBridge(canvas, bus)
    bus.emit('scene:switched', { sceneId: 's9' })
    expect(presence.some(p => p.sceneId === 's9' && p.userId === 'me')).toBe(true)
    destroy()
  })

  it('syncs and prunes userScenes from the presence roster', () => {
    const bus = new EventBus()
    const canvas = mockCanvas()
    canvas.sceneManager.userScenes.set('gone', 'x')
    const destroy = createSyncBridge(canvas, bus)
    bus.emit('presence', { users: [{ userId: 'u1', sceneId: 's2' }, { userId: 'u2' }] })
    expect(canvas.sceneManager.userScenes.get('u1')).toBe('s2')
    expect(canvas.sceneManager.userScenes.get('u2')).toBe('sceneA')  // defaults to active
    expect(canvas.sceneManager.userScenes.has('gone')).toBe(false)
    destroy()
  })
})

describe('VttSyncBridge — init', () => {
  it('DM syncs the fabricated starter scene up to the server once', () => {
    const bus = new EventBus()
    const canvas = mockCanvas({ isDm: true })
    canvas.world.sceneList = [{ id: 'local1', _isLocalDefault: true, toJSON: () => ({ id: 'local1', name: 'Scene 1' }) }]
    const sent = []
    bus.on('record:changed', (e) => sent.push(e))
    const destroy = createSyncBridge(canvas, bus)
    const created = sent.filter(e => e.resource === 'scene' && e.action === 'created')
    expect(created).toHaveLength(1)
    expect(canvas.world.sceneList[0]._isLocalDefault).toBe(false)   // won't re-sync
    destroy()
  })

  it('signals sync-bridge:ready so buffered live events flush', () => {
    const bus = new EventBus()
    let ready = false
    bus.on('sync-bridge:ready', () => { ready = true })
    const destroy = createSyncBridge(mockCanvas(), bus)
    expect(ready).toBe(true)
    destroy()
  })

  it('gesture callbacks are safe no-ops after destroy', () => {
    const canvas = mockCanvas()
    const destroy = createSyncBridge(canvas, new EventBus())
    destroy()
    expect(() => canvas.controller.onTokenDragEnd({ id: 't' })).not.toThrow()
  })
})
