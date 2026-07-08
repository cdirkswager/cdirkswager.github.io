import { Scene } from './Scene.js'

export class SceneManager {
  constructor({ renderer, controller, eventBus }) {
    this.renderer = renderer
    this.controller = controller
    this.eventBus = eventBus
    this._scenes = new Map()
    this._activeSceneId = null
    this._userScenes = new Map()
  }

  get activeScene() {
    return this._scenes.get(this._activeSceneId) ?? null
  }

  get scenes() {
    return Array.from(this._scenes.values())
  }

  get userScenes() {
    return this._userScenes
  }

  add(scene) {
    this._scenes.set(scene.id, scene)
    if (!this._activeSceneId) {
      this._activeSceneId = scene.id
    }
    this.eventBus?.emit('scenes-changed', {})
    return scene
  }

  remove(sceneId) {
    if (sceneId === this._activeSceneId) return
    this._scenes.delete(sceneId)
    for (const [userId, sId] of this._userScenes) {
      if (sId === sceneId) this._userScenes.delete(userId)
    }
    this.eventBus?.emit('scenes-changed', {})
  }

  switchScene(sceneId) {
    const scene = this._scenes.get(sceneId)
    if (!scene || sceneId === this._activeSceneId) return
    this._activeSceneId = sceneId
    this.renderer.loadScene(scene)
    this.renderer.setLightingEnabled(scene.lightingEnabled)
    this.controller.ambientLight = scene.ambientLight ?? 0
    this.controller._spatialIndex.invalidate()
    /* Viewpoint syncs schedule a single coalesced lighting refresh via
       invalidateLighting — previously this block recomputed the full
       vision raycast three times back-to-back. */
    this.controller.syncViewpointToOwnedTokens()
    this.controller.syncViewpointToAllVisionTokens()
    this.controller.invalidateLighting()
    this.eventBus?.emit('scene:switched', { sceneId })
    this.eventBus?.emit('scenes-changed', {})
  }

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

  toJSON() {
    return {
      activeSceneId: this._activeSceneId,
      scenes: this.scenes.map(s => s.toJSON()),
      userScenes: Array.from(this._userScenes.entries()).map(([userId, sceneId]) => ({ userId, sceneId })),
    }
  }

  static fromJSON(data, { renderer, controller, eventBus }) {
    const sm = new SceneManager({ renderer, controller, eventBus })
    for (const sd of data.scenes ?? []) {
      sm.add(Scene.fromJSON(sd))
    }
    if (data.activeSceneId && sm._scenes.has(data.activeSceneId)) {
      sm._activeSceneId = data.activeSceneId
    }
    for (const entry of data.userScenes ?? []) {
      sm._userScenes.set(entry.userId, entry.sceneId)
    }
    return sm
  }
}
