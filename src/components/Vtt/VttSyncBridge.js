import { Token } from '../../vtt/canvas/Token.js'
import { Wall } from '../../vtt/canvas/Wall.js'
import { Template } from '../../vtt/canvas/Template.js'
import { Tile } from '../../vtt/canvas/Tile.js'
import { Actor } from '../../vtt/canvas/Actor.js'
import { Item } from '../../vtt/canvas/Item.js'

export function createSyncBridge(canvas, eventBus) {
  const controller = canvas.controller
  const scene = canvas.scene
  const renderer = canvas.renderer
  const unsubs = []
  const _pendingOps = new Map()
  let _opSeq = 0

  function _nextOpId() { return `op_${++_opSeq}_${Date.now()}` }

  function rollback(opId, message) {
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
    if (err.opId) rollback(err.opId, err.message)
  }))

  controller.getItem = (id) => controller.itemMap?.get(id) ?? null

  controller.equipItem = (itemId, slot) => {
    const item = controller.getItem(itemId)
    if (!item) return
    const opId = _nextOpId()
    const snapshot = { ...item }
    _pendingOps.set(opId, { kind: 'item', snapshot })

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

  controller.unequipItem = (itemId) => {
    const item = controller.getItem(itemId)
    if (!item) return
    const opId = _nextOpId()
    const snapshot = { ...item }
    _pendingOps.set(opId, { kind: 'item', snapshot })
    item.equipped = false
    item.equippedSlot = null
    eventBus.emit('items-changed', {})
    eventBus.emitRecord('item', 'updated', { id: itemId, equipped: false, equippedSlot: null }, opId)
    return opId
  }

  controller.moveItem = (itemId, parentItemId, opts = {}) => {
    const item = controller.getItem(itemId)
    if (!item) return
    const opId = _nextOpId()
    const snapshot = { ...item }
    _pendingOps.set(opId, { kind: 'item', snapshot })
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

  controller.transferItem = ({ itemId, toActorId, toParentItemId = null, quantity = null }) => {
    const opId = _nextOpId()
    eventBus.emitRecord('item', 'transfer', { itemId, toActorId, toParentItemId, quantity }, opId)
    return opId
  }

  controller.splitStack = (itemId, quantity) => {
    const item = controller.getItem(itemId)
    if (!item || !item.stackable) return
    const opId = _nextOpId()
    const snapshot = { ...item }
    _pendingOps.set(opId, { kind: 'item', snapshot })
    item.quantity -= quantity
    eventBus.emit('items-changed', {})
    eventBus.emitRecord('item', 'split-stack', { itemId, quantity }, opId)
    return opId
  }

  controller.dropItem = (itemId) => {
    const item = controller.getItem(itemId)
    if (!item) return
    const opId = _nextOpId()
    const snapshot = { ...item }
    _pendingOps.set(opId, { kind: 'item', snapshot })
    const pile = Actor.createLootPile({ name: `Dropped ${item.name}` })
    controller.itemMap?.delete(itemId)
    eventBus.emit('items-changed', {})
    eventBus.emitRecord('actor', 'created', pile.toJSON())
    eventBus.emitRecord('item', 'transfer', { itemId, toActorId: pile.id, toParentItemId: null, quantity: null }, opId)
    return opId
  }

  controller.createLootPile = (name, seedItems = []) => {
    const pile = Actor.createLootPile({ name })
    eventBus.emitRecord('actor', 'created', pile.toJSON())
    for (const tpl of seedItems) {
      const item = new Item({ ...tpl, actorId: pile.id })
      eventBus.emitRecord('item', 'created', item.toJSON())
    }
    return pile.id
  }

  controller.setAttunement = (itemId, attuned) => {
    const item = controller.getItem(itemId)
    if (!item) return
    const opId = _nextOpId()
    const snapshot = { ...item, attunement: item.attunement ? { ...item.attunement } : null }
    _pendingOps.set(opId, { kind: 'item', snapshot })
    if (!item.attunement) item.attunement = { required: false, attuned: false }
    item.attunement.attuned = attuned
    eventBus.emit('items-changed', {})
    eventBus.emitRecord('item', 'updated', { id: itemId, attunement: { ...item.attunement } }, opId)
    return opId
  }

  controller.setIdentified = (itemId, identified) => {
    const item = controller.getItem(itemId)
    if (!item) return
    const opId = _nextOpId()
    const snapshot = { ...item }
    _pendingOps.set(opId, { kind: 'item', snapshot })
    item.identified = identified
    eventBus.emit('items-changed', {})
    eventBus.emitRecord('item', 'updated', { id: itemId, identified }, opId)
    return opId
  }

  controller.deleteItem = (itemId) => {
    const item = controller.getItem(itemId)
    if (!item) return
    const opId = _nextOpId()
    const snapshot = { ...item }
    _pendingOps.set(opId, { kind: 'item', snapshot })
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

  function removeTokenFromCanvas(id) {
    const existing = scene.getToken(id)
    if (!existing) return
    renderer.removeToken(id)
    scene.removeToken(id)
    controller.invalidateLighting()
  }

  unsubs.push(eventBus.on('token:created', (data) => {
    if (scene.getToken(data.id)) return
    const token = new Token(data)
    canvas.addToken(token)
    controller.invalidateLighting()
    controller.syncViewpointToOwnedTokens()
    controller.syncViewpointToAllVisionTokens()
  }))

  unsubs.push(eventBus.on('token:updated', (data) => {
    const token = scene.getToken(data.id)
    if (token) {
      const prevUserId = token.userId
      token.name = data.name ?? token.name
      token.src = data.src ?? token.src
      token.x = data.x ?? token.x
      token.y = data.y ?? token.y
      token.width = data.width ?? token.width
      token.height = data.height ?? token.height
      token.locked = data.locked ?? token.locked
      token.visible = data.visible ?? token.visible
      token.elevation = data.elevation ?? token.elevation
      token.visionEnabled = data.visionEnabled ?? token.visionEnabled
      token.darkvisionRange = data.darkvisionRange ?? token.darkvisionRange
      token.lightRadius = data.lightRadius ?? token.lightRadius
      token.lightColor = data.lightColor ?? token.lightColor
      token.lightIntensity = data.lightIntensity ?? token.lightIntensity
      if ('actorId' in data) token.actorId = data.actorId
      renderer.updateTokenPosition(token.id, token.x, token.y)
      if ('userId' in data && data.userId !== prevUserId) {
        controller.syncViewpointToOwnedTokens()
        controller.syncViewpointToAllVisionTokens()
      }
    } else {
      canvas.addToken(new Token(data))
    }
    controller.invalidateLighting()
  }))

  unsubs.push(eventBus.on('token:deleted', (data) => {
    removeTokenFromCanvas(data.id)
    controller.syncViewpointToOwnedTokens()
    controller.syncViewpointToAllVisionTokens()
  }))

  unsubs.push(eventBus.on('wall:created', (data) => {
    if (scene.getWall(data.id)) return
    scene.addWall(data instanceof Wall ? data : new Wall(data))
    renderer.redrawWalls()
    controller._spatialIndex.invalidate()
    controller.invalidateLighting()
  }))

  unsubs.push(eventBus.on('wall:updated', (data) => {
    const existing = scene.getWall(data.id)
    if (existing) {
      scene.updateWall(data.id, data)
      renderer.redrawWalls()
      controller._spatialIndex.invalidate()
      controller.invalidateLighting()
    }
  }))

  unsubs.push(eventBus.on('wall:deleted', (data) => {
    scene.removeWall(data.id)
    renderer.redrawWalls()
    controller._spatialIndex.invalidate()
    controller.invalidateLighting()
  }))

  unsubs.push(eventBus.on('template:created', (data) => {
    if (scene.getTemplate(data.id)) return
    const tmpl = data instanceof Template ? data : new Template(data)
    scene.addTemplate(tmpl)
    renderer.templateLayer.draw(scene)
  }))

  unsubs.push(eventBus.on('template:updated', (data) => {
    const existing = scene.getTemplate(data.id)
    if (existing) {
      Object.assign(existing, data)
      renderer.templateLayer.draw(scene)
    } else {
      scene.addTemplate(new Template(data))
      renderer.templateLayer.draw(scene)
    }
  }))

  unsubs.push(eventBus.on('template:deleted', (data) => {
    scene.removeTemplate(data.id)
    renderer.templateLayer.draw(scene)
  }))

  unsubs.push(eventBus.on('tile:created', (data) => {
    if (scene.tiles.some(t => t.id === data.id)) return
    scene.addTile(new Tile(data))
    renderer.loadScene(scene)
  }))

  unsubs.push(eventBus.on('tile:deleted', (data) => {
    scene.removeTile(data.id)
    renderer.loadScene(scene)
  }))

  unsubs.push(eventBus.on('scene:created', (data) => {
    const scene = canvas.scene
    if (!scene) return
    if ('lightingEnabled' in data) {
      scene.lightingEnabled = data.lightingEnabled
      renderer.setLightingEnabled(data.lightingEnabled)
    }
    if ('ambientLight' in data) {
      scene.ambientLight = data.ambientLight
    }
    if (data.lightingEnabled || data.ambientLight) controller.refreshLighting()
  }))

  unsubs.push(eventBus.on('scene:updated', (data) => {
    const scene = canvas.scene
    if (!scene || data.id !== scene.id) return
    if ('lightingEnabled' in data) {
      scene.lightingEnabled = data.lightingEnabled
      renderer.setLightingEnabled(data.lightingEnabled)
      if (data.lightingEnabled) controller.refreshLighting()
    }
    if ('ambientLight' in data) {
      scene.ambientLight = data.ambientLight
      controller.refreshLighting()
    }
  }))

  unsubs.push(eventBus.on('actor:created', (data) => {
    if (controller.actorMap) controller.actorMap.set(data.id, data)
    eventBus.emit('actors-changed', {})
    controller.syncViewpointToOwnedTokens()
    controller.syncViewpointToAllVisionTokens()
  }))

  unsubs.push(eventBus.on('actor:updated', (data) => {
    if (controller.actorMap) {
      const existing = controller.actorMap.get(data.id)
      if (existing) Object.assign(existing, data)
      else controller.actorMap.set(data.id, data)
    }
    eventBus.emit('actors-changed', {})
    controller.syncViewpointToOwnedTokens()
    controller.syncViewpointToAllVisionTokens()
  }))

  unsubs.push(eventBus.on('actor:deleted', (data) => {
    if (controller.actorMap) controller.actorMap.delete(data.id)
    eventBus.emit('actors-changed', {})
    controller.syncViewpointToOwnedTokens()
    controller.syncViewpointToAllVisionTokens()
  }))

  if (!controller.itemMap) controller.itemMap = new Map()

  unsubs.push(eventBus.on('item:created', (data) => {
    controller.itemMap.set(data.id, data)
    eventBus.emit('items-changed', {})
  }))

  unsubs.push(eventBus.on('item:updated', (data) => {
    const existing = controller.itemMap.get(data.id)
    if (existing) controller.itemMap.set(data.id, { ...existing, ...data })
    else controller.itemMap.set(data.id, data)
    eventBus.emit('items-changed', {})
  }))

  unsubs.push(eventBus.on('item:deleted', (data) => {
    controller.itemMap.delete(data.id)
    eventBus.emit('items-changed', {})
  }))

  controller.onTokenDragEnd = (token) => {
    const data = token.toJSON ? token.toJSON() : token
    eventBus.emitRecord('token', 'updated', data)
  }

  controller.onWallCreated = (wall) => {
    eventBus.emitRecord('wall', 'created', wall.toJSON ? wall.toJSON() : wall)
  }

  controller.onWallDeleted = (wall) => {
    eventBus.emitRecord('wall', 'deleted', { id: wall.id })
  }

  controller.onTemplateCreated = (tmpl) => {
    eventBus.emitRecord('template', 'created', tmpl.toJSON ? tmpl.toJSON() : tmpl)
  }

  controller.onTemplateMoved = (tmpl) => {
    eventBus.emitRecord('template', 'updated', tmpl.toJSON ? tmpl.toJSON() : tmpl)
  }

  controller.onTemplateDeleted = (tmpl) => {
    eventBus.emitRecord('template', 'deleted', { id: tmpl.id })
  }

  controller.onDoorToggled = (wall, newState) => {
    eventBus.emitRecord('wall', 'updated', { id: wall.id, doorState: newState })
  }

  eventBus.emit('sync-bridge:ready', {})

  controller.syncViewpointToAllVisionTokens()
  controller._spatialIndex.invalidate()
  controller.refreshLighting()

  eventBus.emitRecord('scene', 'created', canvas.scene.toJSON())

  return function destroySyncBridge() {
    controller.getItem = null
    controller.equipItem = null
    controller.unequipItem = null
    controller.moveItem = null
    controller.splitStack = null
    controller.deleteItem = null
    controller.dropItem = null
    controller.createLootPile = null
    controller.setAttunement = null
    controller.setIdentified = null
    controller.onTokenDragEnd = null
    controller.onWallCreated = null
    controller.onWallDeleted = null
    controller.onTemplateCreated = null
    controller.onTemplateMoved = null
    controller.onTemplateDeleted = null
    controller.onDoorToggled = null
    controller.transferItem = null
    _pendingOps.clear()
    for (const unsub of unsubs) unsub()
  }
}
