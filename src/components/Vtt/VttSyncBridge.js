import { Token } from '../../vtt/canvas/Token.js'
import { Wall } from '../../vtt/canvas/Wall.js'
import { Template } from '../../vtt/canvas/Template.js'
import { Tile } from '../../vtt/canvas/Tile.js'

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
  }))

  unsubs.push(eventBus.on('token:updated', (data) => {
    const token = scene.getToken(data.id)
    if (token) {
      token.name = data.name ?? token.name
      token.src = data.src ?? token.src
      token.x = data.x ?? token.x
      token.y = data.y ?? token.y
      token.width = data.width ?? token.width
      token.height = data.height ?? token.height
      token.locked = data.locked ?? token.locked
      token.visible = data.visible ?? token.visible
      token.elevation = data.elevation ?? token.elevation
      token.sightRange = data.sightRange ?? token.sightRange
      token.visionEnabled = data.visionEnabled ?? token.visionEnabled
      token.darkvisionRange = data.darkvisionRange ?? token.darkvisionRange
      token.lightRadius = data.lightRadius ?? token.lightRadius
      token.lightColor = data.lightColor ?? token.lightColor
      token.lightIntensity = data.lightIntensity ?? token.lightIntensity
      renderer.updateTokenPosition(token.id, token.x, token.y)
    } else {
      canvas.addToken(new Token(data))
    }
    controller.refreshLighting()
  }))

  unsubs.push(eventBus.on('token:deleted', (data) => {
    removeTokenFromCanvas(data.id)
  }))

  unsubs.push(eventBus.on('wall:created', (data) => {
    if (scene.getWall(data.id)) return
    scene.addWall(data instanceof Wall ? data : new Wall(data))
    renderer.redrawWalls()
    controller.refreshLighting()
  }))

  unsubs.push(eventBus.on('wall:updated', (data) => {
    const existing = scene.getWall(data.id)
    if (existing) {
      scene.updateWall(data.id, data)
      renderer.redrawWalls()
      controller.refreshLighting()
    }
  }))

  unsubs.push(eventBus.on('wall:deleted', (data) => {
    scene.removeWall(data.id)
    renderer.redrawWalls()
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
