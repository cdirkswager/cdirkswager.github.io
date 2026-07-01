import { Container, Graphics } from 'pixi.js'

const WORLD_BOUNDS = { x: -50000, y: -50000, w: 100000, h: 100000 }

export class LightingOverlay {
  constructor(renderer) {
    this.renderer = renderer
    this.container = new Container()
    this.container.eventMode = 'none'

    this._darkness = new Graphics()
    this._darkness.eventMode = 'none'
    this._lights = new Graphics()
    this._lights.eventMode = 'none'
    this._lights.blendMode = 'add'

    this.container.addChild(this._darkness)
    this.container.addChild(this._lights)

    this._darknessAlpha = 0.95
    this._ambientLight = 0
    this.visible = false
    this.viewAll = false
  }

  get enabled() {
    return this.container.visible
  }

  set enabled(val) {
    this.container.visible = val
    if (!val) {
      this._clear()
    }
  }

  _clear() {
    this._darkness.clear()
    this._lights.clear()
  }

  update(viewBounds, visionData, ambientLight) {
    if (!this.container.visible) return

    if (this.viewAll) {
      this._clear()
      return
    }

    if (!visionData) {
      this._clear()
      return
    }

    if (ambientLight !== undefined) this._ambientLight = ambientLight
    const alpha = Math.max(0, this._darknessAlpha * (1 - this._ambientLight))

    this._darkness.clear()
    this._lights.clear()

    // ── Darkness with vision polygon cutouts ──────
    if (alpha > 0.01) {
      this._darkness.rect(WORLD_BOUNDS.x, WORLD_BOUNDS.y, WORLD_BOUNDS.w, WORLD_BOUNDS.h)
      this._darkness.fill({ color: 0x000000, alpha })

      const allVisionPolys = visionData.visionPolygons ?? []
      if (visionData.visionPolygon) allVisionPolys.push(visionData.visionPolygon)

      for (const poly of allVisionPolys) {
        if (!poly || poly.length < 3) continue
        this._darkness.cut()
        const pts = poly.flatMap(p => [p.x, p.y])
        this._darkness.poly(pts)
        this._darkness.fill({ color: 0xffffff, alpha: 0 })
      }
    }

    // ── Light polygons (ADD blend) ────────────────
    if (visionData.lightPolygons?.length > 0) {
      for (const lp of visionData.lightPolygons) {
        if (lp.points.length < 3) continue
        const pts = lp.points.flatMap(p => [p.x, p.y])
        const r = (lp.color >> 16) & 0xff
        const g = (lp.color >> 8) & 0xff
        const b = lp.color & 0xff
        const lAlpha = Math.min(lp.intensity * 0.3, 0.3)

        this._lights.poly(pts)
        this._lights.fill({ color: (r << 16) | (g << 8) | b, alpha: lAlpha })

        this._lights.poly(pts)
        this._lights.fill({ color: lp.color, alpha: lAlpha * 0.3 })
      }
    }
  }

  destroy() {
    this._clear()
    this.container.destroy({ children: true })
  }
}
