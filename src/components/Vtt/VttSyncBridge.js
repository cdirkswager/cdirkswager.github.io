import { snapToCell } from '../../vtt/movement.js'

/**
 * VttSyncBridge — the seam between the canvas gestures, the ephemeral
 * channel, and presence. Deliberately small after the redesign:
 *
 *   - RECORD APPLICATION LIVES IN WorldStore (one mutation router),
 *     and rendering in RenderSync (one projection). This bridge no
 *     longer routes token/wall/tile/actor/item records at all — the
 *     double-application and drop-on-mismatch bug classes are gone
 *     because there is nothing here to disagree with the store.
 *
 *   - OUTBOUND: controller gesture callbacks → record emissions
 *     (drag end with tactical grid snap, walls, templates, doors).
 *
 *   - EPHEMERAL: DM scene verbs (activate / pull-all) and presence.
 */
export function createSyncBridge(canvas, eventBus) {
  const controller = canvas.controller
  const sceneManager = canvas.sceneManager
  const world = canvas.world
  const unsubs = []

  /* ── Outbound gestures ─────────────────────────────────────────── */

  controller.onTokenDragEnd = (token) => {
    /* Tactical grid snap: land on the cell like a tactics game. */
    const scene = sceneManager?.activeScene
    if (canvas.gridSnap !== false && scene?.gridSize) {
      const snapped = snapToCell(token.x, token.y, token.width, token.height, scene.gridSize)
      token.x = snapped.x
      token.y = snapped.y
      canvas.renderer?.updateTokenPosition(token.id, token.x, token.y)
    }
    const data = token.toJSON ? token.toJSON() : token
    eventBus.emitRecord('token', 'updated', data)
  }

  controller.onWallCreated = (wall) => {
    /* Stamp the scene so the wall doesn't leak into every other scene. */
    if (wall && !wall.sceneId) wall.sceneId = sceneManager?.activeScene?.id ?? null
    eventBus.emitRecord('wall', 'created', wall.toJSON ? wall.toJSON() : wall)
  }

  controller.onWallDeleted = (wall) => {
    eventBus.emitRecord('wall', 'deleted', { id: wall.id, sceneId: wall.sceneId ?? sceneManager?.activeScene?.id })
  }

  controller.onTemplateCreated = (tmpl) => {
    const data = tmpl.toJSON ? tmpl.toJSON() : tmpl
    if (!data.sceneId) data.sceneId = sceneManager?.activeScene?.id ?? null
    eventBus.emitRecord('template', 'created', data)
  }

  controller.onTemplateMoved = (tmpl) => {
    eventBus.emitRecord('template', 'updated', { id: tmpl.id, x: tmpl.x, y: tmpl.y, sceneId: tmpl.sceneId })
  }

  controller.onTemplateDeleted = (tmpl) => {
    eventBus.emitRecord('template', 'deleted', { id: tmpl.id, sceneId: tmpl.sceneId })
  }

  controller.onDoorToggled = (wall, newState) => {
    eventBus.emitRecord('wall', 'updated', { id: wall.id, doorState: newState, sceneId: wall.sceneId })
  }

  /* ── Presence ──────────────────────────────────────────────────── */

  function announceOwnPresence(sceneId) {
    if (!controller.userId) return
    sceneManager?.setUserScene(controller.userId, sceneId)
    eventBus.emitEphemeral('scene:user-presence', { userId: controller.userId, sceneId })
  }

  /* Announce whenever THIS client changes scene, however it happened. */
  unsubs.push(eventBus.on('scene:switched', ({ sceneId }) => {
    if (sceneId) announceOwnPresence(sceneId)
  }))

  /* Server presence roster — authoritative user→scene source; prunes
     disconnected users. */
  unsubs.push(eventBus.on('presence', ({ users }) => {
    if (!sceneManager || !Array.isArray(users)) return
    const seen = new Set()
    for (const u of users) {
      seen.add(u.userId)
      const sid = u.sceneId ?? world?.activeSceneId
      if (sid && sceneManager.userScenes.get(u.userId) !== sid) {
        sceneManager.setUserScene(u.userId, sid)
      }
    }
    for (const userId of [...sceneManager.userScenes.keys()]) {
      if (!seen.has(userId)) sceneManager.removeUser(userId)
    }
  }))

  /* ── Remote scene verbs (origin remote only; local ones were already
        applied by GameActions before emission) ─────────────────────── */

  unsubs.push(eventBus.on('ephemeral', (data) => {
    if (data.origin !== 'remote') return
    if ((data.type === 'scene:switched' || data.type === 'scene:move-all-users') && data.sceneId) {
      if (data.type === 'scene:move-all-users' && sceneManager) {
        for (const userId of [...sceneManager.userScenes.keys()]) {
          sceneManager.setUserScene(userId, data.sceneId)
        }
      }
      sceneManager?.switchScene(data.sceneId)
    }
    if (data.type === 'scene:user-presence' && sceneManager && data.userId && data.sceneId) {
      sceneManager.setUserScene(data.userId, data.sceneId)
    }
  }))

  /* ── Init ──────────────────────────────────────────────────────── */

  /* Empty server + DM: sync up the fabricated starter scene so the
     server owns it from message one. (Server also self-seeds at boot;
     this is the fallback for older servers.) */
  if (controller.isDm && world) {
    const starter = world.sceneList.find(s => s._isLocalDefault)
    if (starter) {
      eventBus.emitRecord('scene', 'created', starter.toJSON())
      starter._isLocalDefault = false
    }
  }

  /* Tell the sync client we're wired: flushes any live events that
     raced the mount, and replays cached presence. */
  eventBus.emit('sync-bridge:ready', {})

  if (sceneManager?.activeScene) {
    announceOwnPresence(sceneManager.activeScene.id)
  }

  return function destroySyncBridge() {
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
