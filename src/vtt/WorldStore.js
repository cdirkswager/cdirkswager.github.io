import { Scene } from './canvas/Scene.js'
import { Token } from './canvas/Token.js'
import { Wall } from './canvas/Wall.js'
import { Tile } from './canvas/Tile.js'
import { Template } from './canvas/Template.js'

/**
 * WorldStore — the client's authoritative replica of the game world.
 *
 * WHY THIS EXISTS
 * ---------------
 * Every sync failure this project has had shares one root cause: the
 * client had no single world representation. It booted on a locally
 * invented default scene, then replayed an unordered record stream into
 * scattered mutable state (Scene arrays, controller maps, React state),
 * with a per-kind handler deciding routing each time. Any ordering
 * surprise corrupted the world silently and permanently.
 *
 * THE MODEL
 * ---------
 * 1. The server owns the world. The client is a REPLICA.
 * 2. `hydrate(snapshot)` builds the entire world atomically, in a fixed
 *    dependency order (scenes → contents), BEFORE anything renders.
 *    There is no local default scene and no replay race by construction.
 * 3. Every subsequent mutation — remote or local-optimistic — flows
 *    through ONE router, `applyRecord()`. There is exactly one place
 *    that decides where a record lives.
 * 4. Rendering is a projection: RenderSync listens to the effects this
 *    store emits and mirrors only the viewed scene onto the canvas.
 *    Switching scenes is just re-projecting; it cannot "lose" anything
 *    because nothing is ever discarded for being off-screen.
 * 5. `rehydrate()` on reconnect rebuilds from a fresh snapshot, so a
 *    dropped connection can never leave a permanently diverged client.
 *
 * Effects emitted on the bus:
 *   'world:ready'    — first hydration complete; safe to mount canvas
 *   'world:effect'   — { kind, action, id, sceneId, data } after every
 *                      applied record (RenderSync consumes this)
 *   'scenes-changed' — scene list / user-presence changed (panels)
 *   'actors-changed' / 'items-changed' — HUD/inventory refresh
 */
export class WorldStore {
  constructor(eventBus) {
    this.eventBus = eventBus
    this.scenes = new Map()      // sceneId -> Scene (with tokens/walls/tiles/templates)
    this.actors = new Map()      // actorId -> plain actor record
    this.items = new Map()       // itemId  -> plain item record
    this.activeSceneId = null    // server's landing scene for joiners
    this.viewedSceneId = null    // what THIS client is looking at (local)
    this.ready = false
    this._orphans = new Map()    // sceneId -> buffered records awaiting their scene
    this._unsubs = []
  }

  /* ── Lifecycle ─────────────────────────────────────────────────── */

  bind() {
    /* Single mutation path: every record event — origin local (optimistic,
       from GameActions) or remote (server) — is applied here. Idempotent,
       so a local-optimistic apply followed by the server echo is safe. */
    this._unsubs.push(this.eventBus.on('record:changed', (e) => {
      this.applyRecord(e.resource, e.action, e.data)
    }))
    this._unsubs.push(this.eventBus.on('world:snapshot', (snap) => {
      this.hydrate(snap.recordsByType ?? {}, snap.activeSceneId ?? null)
    }))
    return this
  }

  destroy() {
    for (const u of this._unsubs) u()
    this._unsubs = []
  }

  /* ── Atomic hydration ─────────────────────────────────────────── */

  hydrate(recordsByType, activeSceneId) {
    /* Rebuild from scratch — also the reconnect/resync path. */
    this.scenes.clear()
    this.actors.clear()
    this.items.clear()
    this._orphans.clear()

    /* 1. Scenes first — everything else routes by sceneId. */
    for (const rec of recordsByType.scene ?? []) {
      this.scenes.set(rec.id, Scene.fromJSON(rec))
    }

    /* Empty server (fresh table): fabricate one starter scene locally so
       the DM has a canvas; GameActions syncs it up on first bridge init.
       This is the ONLY place a client ever invents a scene. */
    if (this.scenes.size === 0) {
      const starter = new Scene({ name: 'Scene 1' })
      starter._isLocalDefault = true
      this.scenes.set(starter.id, starter)
      activeSceneId = starter.id
    }

    this.activeSceneId =
      activeSceneId && this.scenes.has(activeSceneId)
        ? activeSceneId
        : this.scenes.keys().next().value

    /* Preserve the user's viewed scene across a resync when possible. */
    if (!this.viewedSceneId || !this.scenes.has(this.viewedSceneId)) {
      this.viewedSceneId = this.activeSceneId
    }

    /* 2. Contents, routed by sceneId. Legacy records with no sceneId
       adopt the active scene (matches old single-scene behavior). */
    for (const rec of recordsByType.wall ?? []) this._placeWall(rec)
    for (const rec of recordsByType.tile ?? []) this._placeTile(rec)
    for (const rec of recordsByType.template ?? []) this._placeTemplate(rec)
    for (const rec of recordsByType.token ?? []) this._placeToken(rec)

    /* 3. Flat collections. */
    for (const rec of recordsByType.actor ?? []) this.actors.set(rec.id, { ...rec })
    for (const rec of recordsByType.item ?? []) this.items.set(rec.id, { ...rec })

    const first = !this.ready
    this.ready = true
    this.eventBus.emit(first ? 'world:ready' : 'world:resynced', {})
    this.eventBus.emit('scenes-changed', {})
    this.eventBus.emit('actors-changed', {})
    this.eventBus.emit('items-changed', {})
  }

  /* ── Views ─────────────────────────────────────────────────────── */

  get viewedScene() { return this.scenes.get(this.viewedSceneId) ?? null }
  get activeScene() { return this.scenes.get(this.activeSceneId) ?? null }
  get sceneList() { return [...this.scenes.values()] }

  setViewedScene(sceneId) {
    if (!this.scenes.has(sceneId) || sceneId === this.viewedSceneId) return false
    this.viewedSceneId = sceneId
    this.eventBus.emit('world:view-scene', { sceneId })
    this.eventBus.emit('scenes-changed', {})
    return true
  }

  /** Find a token anywhere, with its owning scene. */
  findToken(id, sceneIdHint) {
    const hinted = sceneIdHint ? this.scenes.get(sceneIdHint) : null
    if (hinted) {
      const t = hinted.getToken(id)
      if (t) return { token: t, scene: hinted }
    }
    for (const s of this.scenes.values()) {
      const t = s.getToken(id)
      if (t) return { token: t, scene: s }
    }
    return { token: null, scene: null }
  }

  _sceneFor(rec) {
    if (rec.sceneId) return this.scenes.get(rec.sceneId) ?? null
    return this.activeScene
  }

  /* ── Placement (hydration + created) ──────────────────────────── */

  _buffer(rec, kind) {
    const list = this._orphans.get(rec.sceneId) ?? []
    list.push({ kind, rec })
    this._orphans.set(rec.sceneId, list)
  }

  _flushOrphans(sceneId) {
    const list = this._orphans.get(sceneId)
    if (!list) return
    this._orphans.delete(sceneId)
    for (const { kind, rec } of list) this.applyRecord(kind, 'created', rec)
  }

  _placeToken(rec) {
    const s = this._sceneFor(rec)
    if (!s) return this._buffer(rec, 'token')
    if (s.getToken(rec.id)) return null
    const token = new Token({ ...rec, sceneId: s.id })
    s.addToken(token)
    return s
  }

  _placeWall(rec) {
    const s = this._sceneFor(rec)
    if (!s) return this._buffer(rec, 'wall')
    if (s.getWall(rec.id)) return null
    s.addWall(new Wall({ ...rec, sceneId: s.id }))
    return s
  }

  _placeTile(rec) {
    const s = this._sceneFor(rec)
    if (!s) return this._buffer(rec, 'tile')
    if (s.tiles.some(t => t.id === rec.id)) return null
    s.addTile(new Tile(rec))
    return s
  }

  _placeTemplate(rec) {
    const s = this._sceneFor(rec)
    if (!s) return this._buffer(rec, 'template')
    if (s.getTemplate?.(rec.id)) return null
    s.addTemplate(rec instanceof Template ? rec : new Template(rec))
    return s
  }

  /* ── The single mutation router ───────────────────────────────── */

  applyRecord(kind, action, data) {
    if (!data) return
    let effect = null

    switch (kind) {
      case 'scene': effect = this._applyScene(action, data); break
      case 'token': effect = this._applyToken(action, data); break
      case 'wall': effect = this._applyPlaced(action, data, 'wall'); break
      case 'tile': effect = this._applyPlaced(action, data, 'tile'); break
      case 'template': effect = this._applyPlaced(action, data, 'template'); break
      case 'actor': effect = this._applyFlat(action, data, this.actors, 'actors-changed'); break
      case 'item': effect = this._applyFlat(action, data, this.items, 'items-changed'); break
      case 'combat': effect = this._applyCombat(action, data); break
      default: return
    }

    if (effect) {
      this.eventBus.emit('world:effect', { kind, action, id: data.id, ...effect })
    }
  }

  _applyScene(action, data) {
    if (action === 'created') {
      if (this.scenes.has(data.id)) {
        this._flushOrphans(data.id)
        return null
      }
      const s = Scene.fromJSON(data)
      const localDefault = this.sceneList.find(sc => sc._isLocalDefault)
      this.scenes.set(s.id, s)
      /* First real server scene replaces the fabricated starter. */
      if (localDefault && localDefault.id !== s.id && !localDefault.tokens.length && !localDefault.walls.length) {
        this.scenes.delete(localDefault.id)
        if (this.activeSceneId === localDefault.id) this.activeSceneId = s.id
        if (this.viewedSceneId === localDefault.id) {
          this.viewedSceneId = s.id
          this.eventBus.emit('world:view-scene', { sceneId: s.id })
        }
      }
      if (!this.activeSceneId) this.activeSceneId = s.id
      this._flushOrphans(s.id)
      this.eventBus.emit('scenes-changed', {})
      return { sceneId: s.id }
    }
    if (action === 'updated') {
      const s = this.scenes.get(data.id)
      if (!s) return null
      const { id, ...changes } = data
      Object.assign(s, changes)
      this.eventBus.emit('scenes-changed', {})
      return { sceneId: s.id, data: changes }
    }
    if (action === 'deleted') {
      if (!this.scenes.has(data.id)) return null
      this.scenes.delete(data.id)
      if (this.viewedSceneId === data.id) {
        this.viewedSceneId = this.activeSceneId !== data.id ? this.activeSceneId : this.scenes.keys().next().value ?? null
        this.eventBus.emit('world:view-scene', { sceneId: this.viewedSceneId })
      }
      if (this.activeSceneId === data.id) this.activeSceneId = this.scenes.keys().next().value ?? null
      this.eventBus.emit('scenes-changed', {})
      return { sceneId: data.id }
    }
    return null
  }

  _applyToken(action, data) {
    if (action === 'created') {
      const s = this._placeToken(data)
      return s ? { sceneId: s.id } : null
    }
    if (action === 'updated') {
      const { token, scene } = this.findToken(data.id, data.sceneId)
      if (!token) return null
      const { id, sceneId, ...changes } = data
      for (const [k, v] of Object.entries(changes)) {
        if (v !== undefined) token[k] = v
      }
      return { sceneId: scene.id, data: changes }
    }
    if (action === 'deleted') {
      const { token, scene } = this.findToken(data.id, data.sceneId)
      if (!token) return null
      scene.removeToken(token.id)
      return { sceneId: scene.id }
    }
    return null
  }

  _applyPlaced(action, data, kind) {
    const place = { wall: '_placeWall', tile: '_placeTile', template: '_placeTemplate' }[kind]
    if (action === 'created') {
      const s = this[place](data)
      return s ? { sceneId: s.id } : null
    }
    /* update/delete: search the hinted scene, then all scenes. */
    const getters = {
      wall: (s, id) => s.getWall(id),
      tile: (s, id) => s.tiles.find(t => t.id === id) ?? null,
      template: (s, id) => s.getTemplate?.(id) ?? null,
    }
    const removers = {
      wall: (s, id) => s.removeWall(id),
      tile: (s, id) => s.removeTile(id),
      template: (s, id) => s.removeTemplate?.(id),
    }
    let owner = null, obj = null
    const hinted = data.sceneId ? this.scenes.get(data.sceneId) : null
    for (const s of hinted ? [hinted, ...this.scenes.values()] : this.scenes.values()) {
      obj = getters[kind](s, data.id)
      if (obj) { owner = s; break }
    }
    if (!obj) return null
    if (action === 'updated') {
      const { id, sceneId, ...changes } = data
      Object.assign(obj, changes)
      return { sceneId: owner.id, data: changes }
    }
    if (action === 'deleted') {
      removers[kind](owner, data.id)
      return { sceneId: owner.id }
    }
    return null
  }

  _applyFlat(action, data, map, changeEvent) {
    if (action === 'created') {
      if (map.has(data.id)) return null
      map.set(data.id, { ...data })
    } else if (action === 'updated') {
      const existing = map.get(data.id)
      if (!existing) { map.set(data.id, { ...data }) } else { Object.assign(existing, data) }
    } else if (action === 'deleted') {
      if (!map.has(data.id)) return null
      map.delete(data.id)
      /* Cascade: deleting a container removes contents (mirrors server). */
      if (changeEvent === 'items-changed') {
        for (const [id, it] of [...map]) {
          if (it.parentItemId === data.id) map.delete(id)
        }
      }
    } else return null
    this.eventBus.emit(changeEvent, {})
    return { sceneId: null }
  }

  /* ── Combat (tactical layer) ──────────────────────────────────── */

  _applyCombat(action, data) {
    if (action === 'deleted') {
      this.combat = null
    } else {
      this.combat = { ...(this.combat ?? {}), ...data }
    }
    this.eventBus.emit('combat-changed', this.combat)
    return { sceneId: this.combat?.sceneId ?? null }
  }
}
