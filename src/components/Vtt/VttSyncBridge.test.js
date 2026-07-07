import { describe, it, expect, beforeEach } from 'vitest'
import { EventBus } from '../../vtt/canvas/EventBus.js'
import { createSyncBridge } from './VttSyncBridge.js'

/* Minimal mock canvas: the bridge only needs these to wire up. */
function mockCanvas() {
  const controller = {
    actorMap: new Map(), itemMap: new Map(),
    invalidateLighting() {}, refreshLighting() {},
    syncViewpointToOwnedTokens() {}, syncViewpointToAllVisionTokens() {},
    _spatialIndex: { invalidate() {} },
  }
  const scene = { getToken: () => null, getWall: () => null, getTemplate: () => null,
    removeToken() {}, addToken() {}, tiles: [], id: 'scene1', toJSON: () => ({ id: 'scene1' }) }
  return { controller, scene, renderer: { removeToken() {} }, addToken() {} }
}

describe('VttSyncBridge — optimistic item mutations', () => {
  let bus, canvas, destroy, sent
  beforeEach(() => {
    bus = new EventBus()
    canvas = mockCanvas()
    sent = []
    // capture what would go to the server, with its opId
    bus.on('record:changed', (e) => sent.push(e))
    destroy = createSyncBridge(canvas, bus)
    // seed an item into the cache the way an init/create would
    bus.emitRecord('item', 'created', { id: 'i1', actorId: 'a1', name: 'Rapier', equipped: false, equippedSlot: null })
  })

  it('equip applies optimistically and sends with an opId', () => {
    const opId = canvas.controller.equipItem('i1', 'mainHand')
    const it = canvas.controller.itemMap.get('i1')
    expect(it.equipped).toBe(true)
    expect(it.equippedSlot).toBe('mainHand')
    const update = sent.find(e => e.action === 'updated' && e.data.id === 'i1')
    expect(update).toBeTruthy()
    expect(update.opId).toBe(opId)      // opId travels to the server
  })

  it('rolls back when the server rejects the op', () => {
    const opId = canvas.controller.equipItem('i1', 'mainHand')
    expect(canvas.controller.itemMap.get('i1').equipped).toBe(true)

    let rejected = null
    bus.on('op-rejected', (m) => { rejected = m })

    // server relays an error tagged with the opId
    bus.emit('sync-error', { opId, message: 'Illegal equip slot' })

    const it = canvas.controller.itemMap.get('i1')
    expect(it.equipped).toBe(false)          // restored
    expect(it.equippedSlot).toBe(null)
    expect(rejected.message).toBe('Illegal equip slot')
  })

  it('does not roll back on success (no matching error)', () => {
    canvas.controller.equipItem('i1', 'mainHand')
    bus.emit('sync-error', { opId: 'some-other-op', message: 'unrelated' })
    expect(canvas.controller.itemMap.get('i1').equipped).toBe(true) // untouched
  })

  it('move into a container updates parentItemId optimistically', () => {
    canvas.controller.moveItem('i1', 'pack1', { unequip: false })
    expect(canvas.controller.itemMap.get('i1').parentItemId).toBe('pack1')
  })

  it('transfer sends a transfer action with an opId but does not mutate locally', () => {
    const opId = canvas.controller.transferItem({ itemId: 'i1', toActorId: 'a2' })
    // no optimistic actor change (reconciles via server broadcast)
    expect(canvas.controller.itemMap.get('i1').actorId).toBe('a1')
    const t = sent.find(e => e.action === 'transfer')
    expect(t.opId).toBe(opId)
    expect(t.data.toActorId).toBe('a2')
  })

  it('splitStack reduces quantity optimistically on the source item', () => {
    bus.emitRecord('item', 'created', { id: 'i2', actorId: 'a1', name: 'Gold', stackable: true, quantity: 50, equipped: false, equippedSlot: null })
    const opId = canvas.controller.splitStack('i2', 20)
    const it = canvas.controller.itemMap.get('i2')
    expect(it.quantity).toBe(30)
  })

  it('deleteItem removes the item from the map optimistically', () => {
    canvas.controller.deleteItem('i1')
    expect(canvas.controller.itemMap.has('i1')).toBe(false)
  })

  it('rolls back splitStack when server rejects', () => {
    bus.emitRecord('item', 'created', { id: 'i3', actorId: 'a1', name: 'Gold', stackable: true, quantity: 50, equipped: false, equippedSlot: null })
    const opId = canvas.controller.splitStack('i3', 10)
    expect(canvas.controller.itemMap.get('i3').quantity).toBe(40)
    bus.emit('sync-error', { opId, message: 'Invalid split' })
    expect(canvas.controller.itemMap.get('i3').quantity).toBe(50)
  })

  it('rolls back deleteItem when server rejects', () => {
    const opId = canvas.controller.deleteItem('i1')
    expect(canvas.controller.itemMap.has('i1')).toBe(false)
    bus.emit('sync-error', { opId, message: 'Permission denied' })
    expect(canvas.controller.itemMap.has('i1')).toBe(true)
  })

  it('cleans up controller methods on destroy', () => {
    destroy()
    expect(canvas.controller.equipItem).toBe(null)
    expect(canvas.controller.transferItem).toBe(null)
    expect(canvas.controller.splitStack).toBe(null)
    expect(canvas.controller.deleteItem).toBe(null)
  })
})
