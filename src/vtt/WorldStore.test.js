import { describe, it, expect, beforeEach } from 'vitest'
import { EventBus } from './canvas/EventBus.js'
import { WorldStore } from './WorldStore.js'

function makeWorld() {
  const bus = new EventBus()
  const world = new WorldStore(bus).bind()
  return { bus, world }
}

describe('WorldStore — atomic hydration', () => {
  it('builds scenes before contents regardless of snapshot key order', () => {
    const { bus, world } = makeWorld()
    /* Hostile order: tokens listed before scenes (the getAllTypes regression). */
    bus.emit('world:snapshot', {
      recordsByType: {
        token: [{ id: 't1', sceneId: 's1', x: 5 }],
        wall: [{ id: 'w1', sceneId: 's1' }],
        scene: [{ id: 's1', name: 'Cave' }],
      },
      activeSceneId: 's1',
    })
    expect(world.ready).toBe(true)
    expect(world.scenes.get('s1').getToken('t1')).toBeTruthy()
    expect(world.scenes.get('s1').getWall('w1')).toBeTruthy()
  })

  it('routes contents to their own scenes — nothing is dropped for being off-screen', () => {
    const { bus, world } = makeWorld()
    bus.emit('world:snapshot', {
      recordsByType: {
        scene: [{ id: 'sA', name: 'A' }, { id: 'sB', name: 'B' }],
        token: [
          { id: 'tA', sceneId: 'sA' },
          { id: 'tB', sceneId: 'sB' },
        ],
      },
      activeSceneId: 'sA',
    })
    expect(world.scenes.get('sA').getToken('tA')).toBeTruthy()
    expect(world.scenes.get('sB').getToken('tB')).toBeTruthy()
    expect(world.scenes.get('sA').getToken('tB')).toBeFalsy()
  })

  it('legacy records with no sceneId adopt the active scene', () => {
    const { bus, world } = makeWorld()
    bus.emit('world:snapshot', {
      recordsByType: {
        scene: [{ id: 's1' }, { id: 's2' }],
        wall: [{ id: 'w-legacy' }],
      },
      activeSceneId: 's2',
    })
    expect(world.scenes.get('s2').getWall('w-legacy')).toBeTruthy()
    expect(world.scenes.get('s1').getWall('w-legacy')).toBeFalsy()
  })

  it('fabricates exactly one starter scene on an empty server', () => {
    const { bus, world } = makeWorld()
    bus.emit('world:snapshot', { recordsByType: {}, activeSceneId: null })
    expect(world.scenes.size).toBe(1)
    expect(world.viewedScene).toBe(world.activeScene)
    expect(world.viewedScene._isLocalDefault).toBe(true)
  })

  it('joiners land on the server active scene, not a local invention', () => {
    const { bus, world } = makeWorld()
    bus.emit('world:snapshot', {
      recordsByType: { scene: [{ id: 's1' }, { id: 's2' }] },
      activeSceneId: 's2',
    })
    expect(world.viewedSceneId).toBe('s2')
  })

  it('rehydrate (reconnect) rebuilds cleanly and preserves the viewed scene when it survives', () => {
    const { bus, world } = makeWorld()
    bus.emit('world:snapshot', {
      recordsByType: { scene: [{ id: 's1' }, { id: 's2' }], token: [{ id: 't1', sceneId: 's2' }] },
      activeSceneId: 's1',
    })
    world.setViewedScene('s2')
    let resynced = false
    bus.on('world:resynced', () => { resynced = true })
    /* Reconnect: server hands back a fresh snapshot with a new token. */
    bus.emit('world:snapshot', {
      recordsByType: { scene: [{ id: 's1' }, { id: 's2' }], token: [{ id: 't1', sceneId: 's2' }, { id: 't2', sceneId: 's2' }] },
      activeSceneId: 's1',
    })
    expect(resynced).toBe(true)
    expect(world.viewedSceneId).toBe('s2')                       // user not yanked by resync
    expect(world.scenes.get('s2').tokens).toHaveLength(2)        // no duplicates, no losses
  })
})

describe('WorldStore — live mutations through the single router', () => {
  let bus, world, effects

  beforeEach(() => {
    ;({ bus, world } = makeWorld())
    bus.emit('world:snapshot', {
      recordsByType: { scene: [{ id: 'sA', name: 'A' }, { id: 'sB', name: 'B' }] },
      activeSceneId: 'sA',
    })
    effects = []
    bus.on('world:effect', (e) => effects.push(e))
  })

  it('stores a token for a non-viewed scene and reports which scene it touched', () => {
    bus.emitRecord('token', 'created', { id: 't1', sceneId: 'sB' }, undefined, 'remote')
    expect(world.scenes.get('sB').getToken('t1')).toBeTruthy()
    expect(effects[0]).toMatchObject({ kind: 'token', action: 'created', sceneId: 'sB' })
  })

  it('is idempotent: optimistic local apply + server echo yields one token', () => {
    bus.emitRecord('token', 'created', { id: 't1', sceneId: 'sA' })                     // local optimistic
    bus.emitRecord('token', 'created', { id: 't1', sceneId: 'sA' }, undefined, 'remote') // server echo
    expect(world.scenes.get('sA').tokens).toHaveLength(1)
  })

  it('buffers records for a not-yet-known scene and flushes on scene:created', () => {
    bus.emitRecord('token', 'created', { id: 'tX', sceneId: 'sC' }, undefined, 'remote')
    expect(world.scenes.get('sA').getToken('tX')).toBeFalsy()   // not misfiled
    bus.emitRecord('scene', 'created', { id: 'sC', name: 'C' }, undefined, 'remote')
    expect(world.scenes.get('sC').getToken('tX')).toBeTruthy()
  })

  it('updates a token wherever it lives, hint or no hint', () => {
    bus.emitRecord('token', 'created', { id: 't1', sceneId: 'sB', x: 0, hp: 10, maxHp: 10 }, undefined, 'remote')
    bus.emitRecord('token', 'updated', { id: 't1', x: 42, hp: 3 }, undefined, 'remote')  // no sceneId hint
    const t = world.scenes.get('sB').getToken('t1')
    expect(t.x).toBe(42)
    expect(t.hp).toBe(3)
  })

  it('deletes from the owning scene only', () => {
    bus.emitRecord('token', 'created', { id: 't1', sceneId: 'sB' }, undefined, 'remote')
    bus.emitRecord('token', 'deleted', { id: 't1' }, undefined, 'remote')
    expect(world.scenes.get('sB').getToken('t1')).toBeFalsy()
  })

  it('first server scene replaces the fabricated starter without stranding the view', () => {
    const { bus: b2, world: w2 } = makeWorld()
    b2.emit('world:snapshot', { recordsByType: {}, activeSceneId: null })
    const starterId = w2.viewedSceneId
    let viewEvents = []
    b2.on('world:view-scene', (e) => viewEvents.push(e.sceneId))
    b2.emitRecord('scene', 'created', { id: 'real-1', name: 'DM Map' }, undefined, 'remote')
    expect(w2.scenes.has(starterId)).toBe(false)
    expect(w2.viewedSceneId).toBe('real-1')
    expect(viewEvents).toContain('real-1')
  })

  it('scene deletion moves the viewer somewhere valid', () => {
    world.setViewedScene('sB')
    bus.emitRecord('scene', 'deleted', { id: 'sB' }, undefined, 'remote')
    expect(world.viewedSceneId).toBe('sA')
    expect(world.viewedScene).toBeTruthy()
  })

  it('walls, tiles and templates route by scene like tokens do', () => {
    bus.emitRecord('wall', 'created', { id: 'w1', sceneId: 'sB' }, undefined, 'remote')
    bus.emitRecord('tile', 'created', { id: 'ti1', sceneId: 'sB' }, undefined, 'remote')
    expect(world.scenes.get('sB').getWall('w1')).toBeTruthy()
    expect(world.scenes.get('sB').tiles).toHaveLength(1)
    expect(world.scenes.get('sA').getWall('w1')).toBeFalsy()
    bus.emitRecord('wall', 'deleted', { id: 'w1' }, undefined, 'remote')
    expect(world.scenes.get('sB').getWall('w1')).toBeFalsy()
  })

  it('actors and items live in flat maps with container cascade on delete', () => {
    bus.emitRecord('actor', 'created', { id: 'a1', name: 'Pip' }, undefined, 'remote')
    bus.emitRecord('item', 'created', { id: 'pack', actorId: 'a1', isContainer: true }, undefined, 'remote')
    bus.emitRecord('item', 'created', { id: 'rope', actorId: 'a1', parentItemId: 'pack' }, undefined, 'remote')
    bus.emitRecord('item', 'deleted', { id: 'pack' }, undefined, 'remote')
    expect(world.items.has('rope')).toBe(false)
  })
})

describe('WorldStore — combat state', () => {
  it('tracks combat records and clears on delete', () => {
    const { bus, world } = makeWorld()
    bus.emit('world:snapshot', { recordsByType: { scene: [{ id: 's1' }] }, activeSceneId: 's1' })
    const seen = []
    bus.on('combat-changed', (c) => seen.push(c))

    bus.emitRecord('combat', 'created', {
      id: 'combat', sceneId: 's1', round: 1, turnIndex: 0,
      combatants: [{ tokenId: 't1', initiative: 17 }],
    }, undefined, 'remote')
    expect(world.combat.round).toBe(1)

    bus.emitRecord('combat', 'updated', { id: 'combat', turnIndex: 1, round: 1 }, undefined, 'remote')
    expect(world.combat.turnIndex).toBe(1)
    expect(world.combat.combatants).toHaveLength(1)   // merge, not replace

    bus.emitRecord('combat', 'deleted', { id: 'combat' }, undefined, 'remote')
    expect(world.combat).toBeFalsy()
    expect(seen.length).toBe(3)
  })
})
