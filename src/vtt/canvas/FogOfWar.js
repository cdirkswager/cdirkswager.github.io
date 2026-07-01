import { Container, Graphics } from 'pixi.js'

const WORLD_BOUNDS = { x: -50000, y: -50000, w: 100000, h: 100000 }

/**
 * Fog of War — persistent explored-region overlay.
 *
 * Renders a darkness overlay with explored-region cutouts using world-space
 * Graphics inside sceneContainer. Since all coordinates are absolute world
 * coords, the overlay automatically tracks pan/zoom with no re-render
 * needed on camera changes.
 *
 * Persistence:
 * - Explored regions are keyed per playerId via `toJSON(playerId)` /
 *   `fromJSON(data)` so each player's exploration memory can be
 *   stored and restored independently.
 */
export class FogOfWar {
  constructor(renderer) {
    this.renderer = renderer
    this.container = new Container()
    this.container.eventMode = 'none'

    this._darkness = new Graphics()
    this._darkness.eventMode = 'none'
    this.container.addChild(this._darkness)

    /** Explored polygons stored as arrays of {x,y} in WORLD coordinates,
     *  keyed by playerId. The default key '*' is used when no player is
     *  specified (single-player / DM). */
    this._playerPolys = { '*': [] }
    this._activePlayerId = '*'
    this._enabled = false
    this.container.visible = false
  }

  get enabled() { return this._enabled }
  set enabled(val) {
    this._enabled = val
    this.container.visible = val
    if (!val) this._darkness.clear()
  }

  /** The active player whose explored polys are being accumulated. */
  set activePlayerId(id) {
    this._activePlayerId = id
    if (!this._playerPolys[id]) {
      this._playerPolys[id] = []
    }
  }

  /** Add new vision polygons (world coords) to the active player's explored set. */
  accumulate(visionPolygons) {
    if (!visionPolygons?.length) return
    const store = this._playerPolys[this._activePlayerId]
    for (const poly of visionPolygons) {
      if (poly && poly.length >= 3) {
        store.push(poly.map(p => ({ x: p.x, y: p.y })))
      }
    }
    this._draw()
  }

  /** Clear all explored regions for the active player (or a specific player). */
  reset(playerId) {
    const id = playerId ?? this._activePlayerId
    if (this._playerPolys[id]) {
      this._playerPolys[id] = []
    }
    this._draw()
  }

  _draw() {
    if (!this._enabled) return

    this._darkness.clear()

    // Full darkness rect
    this._darkness.rect(WORLD_BOUNDS.x, WORLD_BOUNDS.y, WORLD_BOUNDS.w, WORLD_BOUNDS.h)
    this._darkness.fill({ color: 0x000000, alpha: 0.95 })

    // Cut out explored regions
    const store = this._playerPolys[this._activePlayerId]
    if (store) {
      for (const poly of store) {
        if (poly.length < 3) continue
        const pts = poly.flatMap(p => [p.x, p.y])
        this._darkness.poly(pts)
      }
      if (store.length > 0) {
        this._darkness.cut()
        this._darkness.fill()
      }
    }
  }

  /**
   * No-op with Graphics approach. The Graphics is drawn in absolute world
   * coords and automatically stays correct through sceneContainer transforms.
   * Kept for API compatibility with refreshLighting() call sites.
   */
  update() {
    // No-op: world-space Graphics needs no viewport-driven re-render
  }

  /**
   * Serialize explored polys for a given player (or active player).
   * @param {string} [playerId]  If omitted, returns all players' data.
   */
  toJSON(playerId) {
    if (playerId) {
      return this._playerPolys[playerId] ?? []
    }
    return { ...this._playerPolys }
  }

  /**
   * Restore explored polys, keyed by playerId.
   * Accepts either a single player's array or a full { playerId: [...] } map.
   */
  fromJSON(data) {
    if (Array.isArray(data)) {
      /* Legacy single-player format */
      this._playerPolys['*'] = data
    } else if (data && typeof data === 'object') {
      for (const [id, polys] of Object.entries(data)) {
        if (Array.isArray(polys)) {
          this._playerPolys[id] = polys
        }
      }
    }
    this._draw()
  }

  destroy() {
    this._darkness.destroy()
    this.container.destroy({ children: true })
  }
}
