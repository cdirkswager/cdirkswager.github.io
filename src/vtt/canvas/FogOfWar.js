import { Container, Graphics, RenderTexture, Sprite } from 'pixi.js'

/**
 * Fog of War — persistent explored-region overlay.
 *
 * Accumulates vision polygons over time into a set of explored regions.
 * Renders a darkness overlay where only accumulated polygons are cut out.
 *
 * Optimizations:
 * - All hole polygons are batched into a single Graphics object
 *   (O(1) draw calls regardless of explored region count).
 * - When the view has not changed, only newly explored polygons are
 *   rasterized (incremental accumulation).
 * - When pan/zoom changes the view, all polygons are re-projected and
 *   re-rendered from world coordinates.
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
    this._sprite = null
    this._rt = null
    /** Explored polygons stored as arrays of {x,y} in WORLD coordinates,
     *  keyed by playerId. The default key '*' is used when no player is
     *  specified (single-player / DM). */
    this._playerPolys = { '*': [] }
    this._activePlayerId = '*'
    this._dirty = true
    this._enabled = false
    this.container.visible = false

    /** Persistent single Graphics for all hole polygons (ERASE blend). */
    this._holesGraphics = new Graphics()
    this._holesGraphics.eventMode = 'none'

    /** Track how many polys are already baked into _holesGraphics. */
    this._bakedCount = 0

    /** Detect view changes for incremental vs full rebuild. */
    this._lastViewBounds = null
  }

  get enabled() { return this._enabled }
  set enabled(val) {
    this._enabled = val
    this.container.visible = val
    if (!val) this._clearLast()
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
    this._dirty = true
  }

  /** Clear all explored regions for the active player (or a specific player). */
  reset(playerId) {
    const id = playerId ?? this._activePlayerId
    if (this._playerPolys[id]) {
      this._playerPolys[id] = []
    }
    this._bakedCount = 0
    this._dirty = true
  }

  /**
   * Render the fog overlay for the current viewport.
   * @param {{ x: number, y: number, width: number, height: number }} viewBounds
   */
  update(viewBounds) {
    if (!this._enabled) return
    if (!this._dirty && this._sprite) return

    const w = Math.ceil(viewBounds.width)
    const h = Math.ceil(viewBounds.height)
    if (w <= 0 || h <= 0) return

    this._ensureRT(w, h)

    const viewChanged = this._lastViewBounds &&
      (this._lastViewBounds.x !== viewBounds.x ||
       this._lastViewBounds.y !== viewBounds.y ||
       this._lastViewBounds.width !== viewBounds.width ||
       this._lastViewBounds.height !== viewBounds.height)

    const store = this._playerPolys[this._activePlayerId]
    if (!store) {
      this._dirty = false
      this._lastViewBounds = { ...viewBounds }
      return
    }

    if (viewChanged || this._bakedCount === 0) {
      /* View or initial — rebuild holes Graphics from scratch */
      this._holesGraphics.clear()
      this._bakedCount = 0
      this._appendPolys(store, 0, viewBounds)
      this._bakedCount = store.length
    } else if (this._bakedCount < store.length) {
      /* Only add newly accumulated polys */
      this._appendPolys(store, this._bakedCount, viewBounds)
      this._bakedCount = store.length
    }

    /* Render dark backdrop + hole cutouts into RT */
    const temp = new Container()
    const dark = new Graphics()
    dark.rect(0, 0, w, h)
    dark.fill({ color: 0x000000, alpha: 0.85 })
    temp.addChild(dark)

    /* Blit the persistent hole Graphics on top (ERASE cuts through dark) */
    this._holesGraphics.blendMode = 'erase'
    temp.addChild(this._holesGraphics)

    this.renderer.app.renderer.render(temp, { renderTexture: this._rt })
    temp.destroy({ children: true })

    if (!this._sprite) {
      this._sprite = new Sprite(this._rt)
      this._sprite.x = viewBounds.x
      this._sprite.y = viewBounds.y
      this._sprite.eventMode = 'none'
      this.container.addChild(this._sprite)
    }
    this._sprite.x = viewBounds.x
    this._sprite.y = viewBounds.y
    this._sprite.texture = this._rt

    this._dirty = false
    this._lastViewBounds = { ...viewBounds }
  }

  /** Append polys [startIdx .. endIdx) to the shared holes Graphics. */
  _appendPolys(polys, startIdx, viewBounds) {
    for (let i = startIdx; i < polys.length; i++) {
      const poly = polys[i]
      if (poly.length < 3) continue
      const pts = poly.flatMap(p => {
        const sp = this.renderer.worldToScreen(p.x, p.y)
        return [sp.x - viewBounds.x, sp.y - viewBounds.y]
      })
      if (pts.length < 6) continue
      this._holesGraphics.poly(pts)
      this._holesGraphics.fill({ color: 0xffffff })
    }
  }

  _ensureRT(w, h) {
    if (this._rt && this._rt.width === w && this._rt.height === h) return
    this._clearRT()
    this._rt = RenderTexture.create({ width: w, height: h })
  }

  _clearRT() {
    if (this._rt) {
      this._rt.destroy()
      this._rt = null
    }
  }

  _clearLast() {
    if (this._sprite) {
      this.container.removeChild(this._sprite)
      this._sprite.destroy()
      this._sprite = null
    }
    this._clearRT()
    this._holesGraphics.clear()
    this._bakedCount = 0
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
    this._bakedCount = 0
    this._dirty = true
  }

  destroy() {
    this._clearLast()
    this._holesGraphics.destroy()
    this.container.destroy({ children: true })
  }
}
