import { Token } from '../../vtt/canvas/Token.js'
import { Wall } from '../../vtt/canvas/Wall.js'
import { Template } from '../../vtt/canvas/Template.js'
import { Tile } from '../../vtt/canvas/Tile.js'
import { Scene } from '../../vtt/canvas/Scene.js'

/**
 * VttSyncBridge — the INBOUND half of the sync spine.
 *
 * Applies record and ephemeral events (both remote and locally-emitted)
 * to the canvas model/renderer, and wires the controller's outbound
 * gesture callbacks (drag end, wall drawn, ...) to record emissions.
 *
 * Player/DM verbs live in src/vtt/GameActions.js — this module no longer
 * attaches methods to the controller or patches the scene manager.
 */
export function createSyncBridge(canvas, eventBus) {
  const controller = canvas.controller
  const sceneManager = canvas.sceneManager
  const scene = () => sceneManager.activeScene
  const renderer = canvas.renderer
  const unsubs = []
  let _hadServerScenes = false

  /* ── Scene-aware token routing ──────────────────────────────────
     Tokens carry a sceneId. The previous handlers compared it against
     the *currently active* scene and silently dropped any mismatch —
     so a client sitting on scene A permanently lost every token that
     belonged to scene B, and re-loading scene B showed an empty map.
     Now every token is stored on the Scene it belongs to; only the
     active scene's tokens get sprites. Tokens whose scene hasn't
     arrived yet (record replay is not ordered) are buffered and
     flushed when that scene is created. */
  const _orphanTokens = new Map()   // sceneId -> token data[]

  function sceneById(sceneId) {
    if (!sceneId) return scene()
    return sceneManager?._scenes.get(sceneId) ?? null
  }

  /** Find a token across every loaded scene, plus its owning scene. */
  function findToken(id, sceneId) {
    const direct = sceneById(sceneId)
    if (direct) {
      const t = direct.getToken(id)
      if (t) return { token: t, scene: direct }
    }
    for (const s of sceneManager?.scenes ?? []) {
      const t = s.getToken(id)
      if (t) return { token: t, scene: s }
    }
    return { token: null, scene: null }
  }

  function attachToken(data) {
    const target = sceneById(data.sceneId)
    if (!target) {
      /* Scene not loaded yet — buffer until scene:created. */
      const list = _orphanTokens.get(data.sceneId) ?? []
      list.push(data)
      _orphanTokens.set(data.sceneId, list)
      return
    }
    if (target.getToken(data.id)) return
    const token = new Token({ ...data, sceneId: target.id })
    target.addToken(token)
    /* Only the viewed scene gets a sprite. */
    if (target.id === sceneManager?.activeScene?.id) {
      renderer.addToken(token)
      controller.invalidateLighting()
      controller.syncViewpointToOwnedTokens()
      controller.syncViewpointToAllVisionTokens()
    }
  }

  function flushOrphanTokens(sceneId) {
    const list = _orphanTokens.get(sceneId)
    if (!list) return
    _orphanTokens.delete(sceneId)
    for (const data of list) attachToken(data)
  }

  unsubs.push(eventBus.on('token:created', (data) => {
    attachToken(data)
  }))

  unsubs.push(eventBus.on('token:updated', (data) => {
    const { token, scene: owner } = findToken(data.id, data.sceneId)
    if (!token) return
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
    /* Off-screen scenes have no sprites to update. */
    if (owner?.id !== sceneManager?.activeScene?.id) return
    renderer.updateTokenPosition(token.id, token.x, token.y)
    if ('userId' in data && data.userId !== prevUserId) {
      controller.syncViewpointToOwnedTokens()
      controller.syncViewpointToAllVisionTokens()
    }
    controller.invalidateLighting()
  }))

  unsubs.push(eventBus.on('token:deleted', (data) => {
    const { token, scene: owner } = findToken(data.id, data.sceneId)
    if (!token || !owner) return
    if (owner.id === sceneManager?.activeScene?.id) {
      renderer.removeToken(token.id)
    }
    owner.removeToken(token.id)
    controller.invalidateLighting()
    controller.syncViewpointToOwnedTokens()
    controller.syncViewpointToAllVisionTokens()
  }))

  unsubs.push(eventBus.on('wall:created', (data) => {
    /* Legacy walls (no sceneId) adopt whichever scene is active when they
       load, preserving the old behavior for existing saves. */
    const target = sceneById(data.sceneId)
    if (!target) return
    if (target.getWall(data.id)) return
    const wall = data instanceof Wall ? data : new Wall({ ...data, sceneId: target.id })
    target.addWall(wall)
    if (target.id !== sceneManager?.activeScene?.id) return
    renderer.redrawWalls()
    controller._spatialIndex.invalidate()
    controller.invalidateLighting()
  }))

  unsubs.push(eventBus.on('wall:updated', (data) => {
    const s = scene()
    const existing = s.getWall(data.id)
    if (existing) {
      s.updateWall(data.id, data)
      renderer.redrawWalls()
      controller._spatialIndex.invalidate()
      controller.invalidateLighting()
    }
  }))

  unsubs.push(eventBus.on('wall:deleted', (data) => {
    scene().removeWall(data.id)
    renderer.redrawWalls()
    controller._spatialIndex.invalidate()
    controller.invalidateLighting()
  }))

  unsubs.push(eventBus.on('template:created', (data) => {
    const s = scene()
    if (s.getTemplate(data.id)) return
    const tmpl = data instanceof Template ? data : new Template(data)
    s.addTemplate(tmpl)
    renderer.templateLayer.draw(s)
  }))

  unsubs.push(eventBus.on('template:updated', (data) => {
    const s = scene()
    const existing = s.getTemplate(data.id)
    if (existing) {
      Object.assign(existing, data)
      renderer.templateLayer.draw(s)
    } else {
      s.addTemplate(new Template(data))
      renderer.templateLayer.draw(s)
    }
  }))

  unsubs.push(eventBus.on('template:deleted', (data) => {
    scene().removeTemplate(data.id)
    renderer.templateLayer.draw(scene())
  }))

  unsubs.push(eventBus.on('tile:created', (data) => {
    if (scene().tiles.some(t => t.id === data.id)) return
    const tile = new Tile(data)
    scene().addTile(tile)
    /* Incremental — a tile create no longer rebuilds the whole scene. */
    renderer.addTile(tile)
  }))

  unsubs.push(eventBus.on('tile:deleted', (data) => {
    scene().removeTile(data.id)
    renderer.removeTile(data.id)
  }))

  unsubs.push(eventBus.on('scene:updated', (data) => {
    const s = scene()
    if (!s || data.id !== s.id) return
    if ('lightingEnabled' in data) {
      if (s.lightingEnabled === data.lightingEnabled) return
      s.lightingEnabled = data.lightingEnabled
      renderer.setLightingEnabled(data.lightingEnabled)
      if (data.lightingEnabled) controller.refreshLighting()
    }
    if ('ambientLight' in data) {
      if (s.ambientLight === data.ambientLight) return
      s.ambientLight = data.ambientLight
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

  // Let the renderer resolve a token's default glyph from its linked actor type.
  if (canvas.renderer) {
    canvas.renderer.getActorType = (actorId) => controller.actorMap?.get(actorId)?.actorType
  }

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
    /* Stamp the scene so the wall doesn't leak into every other scene. */
    if (wall && !wall.sceneId) wall.sceneId = sceneManager?.activeScene?.id ?? null
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

  /* Switch to the server's active scene after init replay */
  unsubs.push(eventBus.on('scene:init-active', ({ sceneId }) => {
    if (sceneManager && sceneId && sceneManager._scenes.has(sceneId)) {
      sceneManager.switchScene(sceneId)
    }
  }))

  /* Announce this client's own scene to the server (bounded: one message
     per switch; presence never triggers further switches, so no loops). */
  function announceOwnPresence(sceneId) {
    if (!controller.userId) return
    sceneManager?.setUserScene(controller.userId, sceneId)
    eventBus.emitEphemeral('scene:user-presence', { userId: controller.userId, sceneId })
  }

  /* Remote ephemerals. Locally-originated scene verbs are already applied
     by GameActions before emission, so only origin==='remote' is handled. */
  unsubs.push(eventBus.on('ephemeral', (data) => {
    if (data.origin !== 'remote') return
    if (data.type === 'scene:switched' && sceneManager && data.sceneId) {
      /* DM activated a scene — everyone follows. */
      sceneManager.switchScene(data.sceneId)
      announceOwnPresence(data.sceneId)
    }
    if (data.type === 'scene:move-all-users' && sceneManager && data.sceneId) {
      for (const userId of [...sceneManager.userScenes.keys()]) {
        sceneManager.setUserScene(userId, data.sceneId)
      }
      sceneManager.switchScene(data.sceneId)
      announceOwnPresence(data.sceneId)
    }
    if (data.type === 'scene:user-presence' && sceneManager && data.userId && data.sceneId) {
      sceneManager.setUserScene(data.userId, data.sceneId)
    }
  }))

  /* Server presence roster (users now carry their sceneId). This is the
     authoritative user→scene source; it also prunes disconnected users. */
  unsubs.push(eventBus.on('presence', ({ users }) => {
    if (!sceneManager || !Array.isArray(users)) return
    const seen = new Set()
    for (const u of users) {
      seen.add(u.userId)
      const sid = u.sceneId ?? sceneManager.activeScene?.id
      if (sid && sceneManager.userScenes.get(u.userId) !== sid) {
        sceneManager.setUserScene(u.userId, sid)
      }
    }
    for (const userId of [...sceneManager.userScenes.keys()]) {
      if (!seen.has(userId)) sceneManager.removeUser(userId)
    }
  }))

  /* New scene created remotely */
  unsubs.push(eventBus.on('scene:created', (data) => {
    if (!sceneManager) return
    if (!sceneManager.scenes.some(s => s.id === data.id)) {
      const hadServerScenes = _hadServerScenes
      _hadServerScenes = true
      const s = Scene.fromJSON(data)
      sceneManager.add(s)
      /* First server scene: switch away from the local default so the
         active scene ID matches the DM's scene (needed for lighting sync). */
      if (!hadServerScenes) {
        const localDefaults = sceneManager.scenes.filter(sc => sc._isLocalDefault)
        for (const d of localDefaults) {
          if (d.id !== sceneManager.activeScene?.id) {
            sceneManager.remove(d.id)
          } else {
            sceneManager.switchScene(s.id)
            sceneManager.remove(d.id)
          }
        }
      }
    }
    /* Always flush: tokens may have been buffered for this scene even if
       the scene object itself was already registered. */
    flushOrphanTokens(data.id)
  }))

  /* Scene deleted remotely — if the deleted scene is active, switch away first */
  unsubs.push(eventBus.on('scene:deleted', (data) => {
    if (!sceneManager) return
    if (sceneManager.activeScene?.id === data.id) {
      const other = sceneManager.scenes.find(s => s.id !== data.id)
      if (other) sceneManager.switchScene(other.id)
    }
    sceneManager.remove(data.id)
  }))

  eventBus.emit('sync-bridge:ready', {})

  controller.syncViewpointToAllVisionTokens()
  controller._spatialIndex.invalidate()
  controller.refreshLighting()

  /* After init replay, if server scenes exist, remove the local default
     scene and switch to the first server scene so new clients don't
     see a blank temporary scene. */
  if (_hadServerScenes && sceneManager) {
    const localDefaults = sceneManager.scenes.filter(s => s._isLocalDefault)
    for (const d of localDefaults) {
      if (d.id !== sceneManager.activeScene?.id) {
        sceneManager.remove(d.id)
      } else {
        const serverScene = sceneManager.scenes.find(s => !s._isLocalDefault)
        if (serverScene) {
          sceneManager.switchScene(serverScene.id)
          sceneManager.remove(d.id)
        }
      }
    }
  }

  /* If no server scenes exist and we're the DM, sync the local 
     default scene to the server so it can be updated (lighting, etc.). */
  if (!_hadServerScenes && controller.isDm && sceneManager) {
    const localDefault = sceneManager.scenes.find(s => s._isLocalDefault)
    if (localDefault) {
      eventBus.emitRecord('scene', 'created', localDefault.toJSON())
    }
  }

  /* Tell the server (and everyone) which scene this client is viewing.
     Previously the bridge broadcast presence for OTHER users from its own
     local map — a client should only ever announce itself. */
  if (sceneManager?.activeScene) {
    announceOwnPresence(sceneManager.activeScene.id)
  }

  return function destroySyncBridge() {
    /* Replace outbound gesture callbacks with no-ops rather than nulling
       them — late-firing pointer events during teardown must not crash. */
    const noop = () => {}
    controller.onTokenDragEnd = noop
    controller.onWallCreated = noop
    controller.onWallDeleted = noop
    controller.onTemplateCreated = noop
    controller.onTemplateMoved = noop
    controller.onTemplateDeleted = noop
    controller.onDoorToggled = noop
    for (const unsub of unsubs) unsub()
  }
}
