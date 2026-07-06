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

  function removeTokenFromCanvas(id) {
    const existing = scene.getToken(id)
    if (!existing) return
    renderer.removeToken(id)
    scene.removeToken(id)
    controller.refreshLighting()
  }

  /* ---------- Incoming record handlers ---------- */
  unsubs.push(eventBus.on('token:created', (data) => {
    if (scene.getToken(data.id)) return
    const token = new Token(data)
    canvas.addToken(token)
    controller.refreshLighting()
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
    controller.refreshLighting()
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
    controller.refreshLighting()
  }))

  unsubs.push(eventBus.on('wall:updated', (data) => {
    const existing = scene.getWall(data.id)
    if (existing) {
      scene.updateWall(data.id, data)
      renderer.redrawWalls()
      controller._spatialIndex.invalidate()
      controller.refreshLighting()
    }
  }))

  unsubs.push(eventBus.on('wall:deleted', (data) => {
    scene.removeWall(data.id)
    renderer.redrawWalls()
    controller._spatialIndex.invalidate()
    controller.refreshLighting()
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

  /* ---------- Scene record updates (lighting settings persistence) ---------- */
  unsubs.push(eventBus.on('scene:created', (data) => {
    /* Apply persisted scene settings on init replay */
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

  /* ---------- Actor/Item record handlers (game-level, no renderer impact) ---------- */
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

  unsubs.push(eventBus.on('item:created', (data) => {
    eventBus.emit('items-changed', {})
  }))

  unsubs.push(eventBus.on('item:updated', (data) => {
    eventBus.emit('items-changed', {})
  }))

  unsubs.push(eventBus.on('item:deleted', (data) => {
    eventBus.emit('items-changed', {})
  }))

  /* ---------- Outgoing: wire canvas callbacks to emit sync events ---------- */

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

  /* Signal the sync client that the bridge is ready for init record replay.
     Replay must run before scene:created is emitted so the scene is populated
     before we snapshot its state to the server. */
  eventBus.emit('sync-bridge:ready', {})

  /* Post-replay finalization: recompute shared viewpoint from loaded vision
     tokens, then rebuild spatial index and refresh lighting.  This guarantees
     loaded walls are indexed and vision tokens drive vision regardless of the
     order in which init records were replayed. */
  controller.syncViewpointToAllVisionTokens()
  controller._spatialIndex.invalidate()
  controller.refreshLighting()

  /* Ensure the scene exists as a server record so lighting/ambient updates don't fail */
  eventBus.emitRecord('scene', 'created', canvas.scene.toJSON())

  return function destroySyncBridge() {
    controller.onTokenDragEnd = null
    controller.onWallCreated = null
    controller.onWallDeleted = null
    controller.onTemplateCreated = null
    controller.onTemplateMoved = null
    controller.onTemplateDeleted = null
    controller.onDoorToggled = null
    for (const unsub of unsubs) unsub()
  }
}
