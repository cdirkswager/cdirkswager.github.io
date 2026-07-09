import { Actor } from './canvas/Actor.js'
import { Item } from './canvas/Item.js'
import { Scene } from './canvas/Scene.js'
import { createCombat, nextTurn, previousTurn } from './combat.js'

/**
 * GameActions — the explicit command layer between the UI and the sync spine.
 *
 * Every player/DM verb lives here as a plain function that:
 *   1. applies the change optimistically to the local model (where safe),
 *   2. emits the record/ephemeral with origin 'local' so VttSyncClient
 *      forwards it to the server,
 *   3. registers a snapshot so a server rejection (sync-error with the
 *      matching opId) rolls the optimistic change back.
 *
 * This replaces the old pattern of monkey-patching verbs onto
 * CanvasController / SceneManager at sync-bridge mount time, which made
 * behavior depend on mount order and left nulled-out methods behind on
 * teardown. UI components receive this object as an `actions` prop.
 *
 * VttSyncBridge remains the *inbound* half: it applies remote events to
 * the canvas. GameActions is the *outbound* half.
 */
export function createGameActions({ canvas, eventBus }) {
  const controller = canvas.controller
  const sceneManager = canvas.sceneManager
  const world = canvas.world
  const unsubs = []
  const _pendingOps = new Map()
  let _opSeq = 0

  function _nextOpId() { return `op_${++_opSeq}_${Date.now()}` }

  function getItem(id) { return controller.itemMap?.get(id) ?? null }

  function _snapshotItemOp(opId, item) {
    _pendingOps.set(opId, {
      kind: 'item',
      snapshot: { ...item, attunement: item.attunement ? { ...item.attunement } : item.attunement },
    })
  }

  function _rollback(opId, message) {
    const pending = _pendingOps.get(opId)
    if (!pending) return
    _pendingOps.delete(opId)
    const { kind, snapshot } = pending
    if (kind === 'item') {
      const item = controller.itemMap?.get(snapshot.id)
      if (item) Object.assign(item, snapshot)
      else controller.itemMap?.set(snapshot.id, { ...snapshot })
      eventBus.emit('items-changed', {})
    }
    eventBus.emit('op-rejected', { opId, message })
  }

  unsubs.push(eventBus.on('sync-error', (err) => {
    if (err.opId) _rollback(err.opId, err.message)
  }))

  /* ── Item verbs ─────────────────────────────────────────────── */

  function equipItem(itemId, slot) {
    const item = getItem(itemId)
    if (!item) return
    const opId = _nextOpId()
    _snapshotItemOp(opId, item)
    if (controller.itemMap) {
      for (const [, it] of controller.itemMap) {
        if (it.actorId === item.actorId && it.equipped && it.equippedSlot === slot && it.id !== itemId) {
          it.equipped = false
          it.equippedSlot = null
        }
      }
    }
    item.equipped = true
    item.equippedSlot = slot
    eventBus.emit('items-changed', {})
    eventBus.emitRecord('item', 'updated', { id: itemId, equipped: true, equippedSlot: slot }, opId)
    return opId
  }

  function unequipItem(itemId) {
    const item = getItem(itemId)
    if (!item) return
    const opId = _nextOpId()
    _snapshotItemOp(opId, item)
    item.equipped = false
    item.equippedSlot = null
    eventBus.emit('items-changed', {})
    eventBus.emitRecord('item', 'updated', { id: itemId, equipped: false, equippedSlot: null }, opId)
    return opId
  }

  function moveItem(itemId, parentItemId, opts = {}) {
    const item = getItem(itemId)
    if (!item) return
    const opId = _nextOpId()
    _snapshotItemOp(opId, item)
    if (opts.unequip) {
      item.equipped = false
      item.equippedSlot = null
    }
    item.parentItemId = parentItemId
    eventBus.emit('items-changed', {})
    eventBus.emitRecord('item', 'updated', {
      id: itemId,
      parentItemId,
      ...(opts.unequip ? { equipped: false, equippedSlot: null } : {}),
    }, opId)
    return opId
  }

  function transferItem({ itemId, toActorId, toParentItemId = null, quantity = null }) {
    const opId = _nextOpId()
    eventBus.emitRecord('item', 'transfer', { itemId, toActorId, toParentItemId, quantity }, opId)
    return opId
  }

  function splitStack(itemId, quantity) {
    const item = getItem(itemId)
    if (!item || !item.stackable) return
    const opId = _nextOpId()
    _snapshotItemOp(opId, item)
    item.quantity -= quantity
    eventBus.emit('items-changed', {})
    eventBus.emitRecord('item', 'split-stack', { itemId, quantity }, opId)
    return opId
  }

  function setAttunement(itemId, attuned) {
    const item = getItem(itemId)
    if (!item) return
    const opId = _nextOpId()
    _snapshotItemOp(opId, item)
    if (!item.attunement) item.attunement = { required: false, attuned: false }
    item.attunement.attuned = attuned
    eventBus.emit('items-changed', {})
    eventBus.emitRecord('item', 'updated', { id: itemId, attunement: { ...item.attunement } }, opId)
    return opId
  }

  function setIdentified(itemId, identified) {
    const item = getItem(itemId)
    if (!item) return
    const opId = _nextOpId()
    _snapshotItemOp(opId, item)
    item.identified = identified
    eventBus.emit('items-changed', {})
    eventBus.emitRecord('item', 'updated', { id: itemId, identified }, opId)
    return opId
  }

  function deleteItem(itemId) {
    const item = getItem(itemId)
    if (!item) return
    const opId = _nextOpId()
    _snapshotItemOp(opId, item)
    controller.itemMap?.delete(itemId)
    if (item.isContainer) {
      for (const [, it] of controller.itemMap ?? []) {
        if (it.parentItemId === itemId) controller.itemMap?.delete(it.id)
      }
    }
    eventBus.emit('items-changed', {})
    eventBus.emitRecord('item', 'deleted', { id: itemId }, opId)
    return opId
  }

  function dropItem(itemId) {
    const item = getItem(itemId)
    if (!item) return
    const opId = _nextOpId()
    _snapshotItemOp(opId, item)
    const pile = Actor.createLootPile({ name: `Dropped ${item.name}` })
    controller.itemMap?.delete(itemId)
    eventBus.emit('items-changed', {})
    eventBus.emitRecord('actor', 'created', pile.toJSON())
    eventBus.emitRecord('item', 'transfer', { itemId, toActorId: pile.id, toParentItemId: null, quantity: null }, opId)
    return opId
  }

  /**
   * Create a loot pile.
   *   createLootPile('Chest')                       — empty named pile (legacy)
   *   createLootPile('Chest', [itemTemplates])      — pile seeded client-side
   *   createLootPile({ x, y, fromItemId, name })    — server-side placed pile
   *     with a map token, atomically seeded from an existing item. This is
   *     the drop-to-ground path (previously mis-wired: the object form hit
   *     the (name, seedItems) signature and produced an unplaced pile named
   *     "[object Object]").
   */
  function createLootPile(nameOrOpts, seedItems = []) {
    if (nameOrOpts && typeof nameOrOpts === 'object') {
      eventBus.emit('net:send', { type: 'create-loot-pile', ...nameOrOpts })
      return null
    }
    const pile = Actor.createLootPile({ name: nameOrOpts })
    eventBus.emitRecord('actor', 'created', pile.toJSON())
    for (const tpl of seedItems) {
      const item = new Item({ ...tpl, actorId: pile.id })
      eventBus.emitRecord('item', 'created', item.toJSON())
    }
    return pile.id
  }

  /* ── Scene verbs ────────────────────────────────────────────── */

  function _announcePresence(sceneId) {
    if (!controller.userId) return
    sceneManager?.setUserScene(controller.userId, sceneId)
    eventBus.emitEphemeral('scene:user-presence', { userId: controller.userId, sceneId })
  }

  /** View a scene locally. Does NOT move anyone else (Foundry-style). */
  function viewScene(sceneId) {
    if (!sceneManager) return
    sceneManager.switchScene(sceneId)
    _announcePresence(sceneId)
  }

  /** DM: make a scene the active scene and pull every client to it.
      Server rejects this ephemeral from non-DM users. */
  function activateScene(sceneId) {
    if (!sceneManager) return
    sceneManager.switchScene(sceneId)
    eventBus.emitEphemeral('scene:switched', { sceneId })
    _announcePresence(sceneId)
  }

  /** DM: move all connected users to a scene. */
  function pullAllUsers(sceneId) {
    if (!sceneManager) return
    sceneManager.moveAllUsersToScene(sceneId)
    eventBus.emitEphemeral('scene:move-all-users', { sceneId })
  }

  function createScene(name) {
    const s = new Scene({ name: name ?? `Scene ${(world?.sceneList.length ?? 0) + 1}` })
    /* One mutation path: emit the record; WorldStore applies it (origin
       'local' applies optimistically, server echo is idempotent). */
    eventBus.emitRecord('scene', 'created', s.toJSON())
    return s
  }

  function deleteScene(sceneId) {
    if (sceneId === world?.viewedSceneId) return
    eventBus.emitRecord('scene', 'deleted', { id: sceneId })
  }

  /** Scene updates are a pure record emission: WorldStore mutates the
      model, RenderSync mirrors canvas side effects if the scene is the
      one being viewed. No hand-rolled canvas pokes here anymore. */
  function updateScene(sceneId, changes) {
    eventBus.emitRecord('scene', 'updated', { id: sceneId, ...changes })
  }

  /* ── Tactical verbs ─────────────────────────────────────────────── */

  /** DM: roll initiative for every visible token on the viewed scene. */
  function startCombat() {
    const scene = world?.viewedScene
    if (!scene) return
    const tokens = scene.tokens.filter(t => t.visible !== false)
    if (!tokens.length) return
    const combat = createCombat(scene.id, tokens)
    eventBus.emitRecord('combat', world?.combat ? 'updated' : 'created', combat)
    return combat
  }

  function advanceTurn() {
    if (!world?.combat) return
    eventBus.emitRecord('combat', 'updated', { id: 'combat', ...nextTurn(world.combat) })
  }

  function rewindTurn() {
    if (!world?.combat) return
    eventBus.emitRecord('combat', 'updated', { id: 'combat', ...previousTurn(world.combat) })
  }

  function endCombat() {
    if (!world?.combat) return
    eventBus.emitRecord('combat', 'deleted', { id: 'combat' })
  }

  /** Adjust a token's hit points (delta may be negative for damage). */
  function adjustTokenHp(tokenId, delta) {
    const { token } = world?.findToken(tokenId) ?? {}
    if (!token || !(token.maxHp > 0)) return
    const hp = Math.max(0, Math.min((token.hp ?? token.maxHp) + delta, token.maxHp))
    eventBus.emitRecord('token', 'updated', { id: tokenId, sceneId: token.sceneId, hp })
  }

  function setTokenStats(tokenId, { hp, maxHp, speed }) {
    const { token } = world?.findToken(tokenId) ?? {}
    if (!token) return
    const changes = { id: tokenId, sceneId: token.sceneId }
    if (hp !== undefined) changes.hp = hp
    if (maxHp !== undefined) changes.maxHp = maxHp
    if (speed !== undefined) changes.speed = speed
    eventBus.emitRecord('token', 'updated', changes)
  }

  function toggleGridSnap() {
    canvas.gridSnap = canvas.gridSnap === false
    return canvas.gridSnap
  }

  function destroy() {
    for (const u of unsubs) u()
    _pendingOps.clear()
  }

  return {
    getItem,
    equipItem, unequipItem, moveItem, transferItem, splitStack,
    setAttunement, setIdentified, deleteItem, dropItem, createLootPile,
    viewScene, activateScene, pullAllUsers,
    createScene, deleteScene, updateScene,
    startCombat, advanceTurn, rewindTurn, endCombat,
    adjustTokenHp, setTokenStats, toggleGridSnap,
    destroy,
  }
}
