/**
 * SceneManager — thin view controller over the WorldStore.
 *
 * The store owns all scenes; this class owns "what is this client
 * looking at" and the render transition when that changes, plus the
 * user-presence map that drives the scene panel's user dots.
 *
 * The pre-redesign SceneManager owned its own scene Map, which meant a
 * second source of truth beside the sync layer — the origin of the
 * dropped-token and wrong-scene bugs. That Map is gone.
 */
export class SceneManager {
  constructor({ world, renderer, controller, eventBus }) {
    this.world = world
    this.renderer = renderer
    this.controller = controller
    this.eventBus = eventBus
    this._userScenes = new Map()
  }

  /* The scene this client is viewing. Kept under the historical name
     `activeScene` because the controller/renderer/panels read it. */
  get activeScene() { return this.world.viewedScene }
  get scenes() { return this.world.sceneList }
  get userScenes() { return this._userScenes }
  /* Back-compat for callers that poked the raw map. */
  get _scenes() { return this.world.scenes }

  /** View a scene: pure projection from the store — nothing can be lost.
      Rendering happens in RenderSync (subscribed to 'world:view-scene'),
      so there is exactly one render path for local, remote, and resync
      scene changes. */
  switchScene(sceneId) {
    if (!this.world.setViewedScene(sceneId)) return
    this.eventBus?.emit('scene:switched', { sceneId })
  }

  /* ── User presence (scene panel dots) ─────────────────────────── */

  setUserScene(userId, sceneId) {
    this._userScenes.set(userId, sceneId)
    this.eventBus?.emit('scenes-changed', {})
  }

  removeUser(userId) {
    this._userScenes.delete(userId)
    this.eventBus?.emit('scenes-changed', {})
  }

  getUsersOnScene(sceneId) {
    const users = []
    for (const [userId, sId] of this._userScenes) {
      if (sId === sceneId) users.push(userId)
    }
    return users
  }

  moveAllUsersToScene(sceneId) {
    for (const userId of this._userScenes.keys()) {
      this._userScenes.set(userId, sceneId)
    }
    this.eventBus?.emit('scenes-changed', {})
  }
}
