/*
 * Lighting & Vision — PixiJS overlay renderer.
 *
 * Renders a darkness overlay with vision-polygon cutouts and additive
 * light blending above the scene layer.
 *
 * ── Known limitation (visual masking only) ───────────────────────
 * This overlay hides pixels on the canvas, but the player's browser
 * still receives all token/wall/light data. A determined player can
 * inspect their client to see hidden tokens. This is NOT a security
 * boundary; true hidden-information enforcement requires server-side
 * visibility checks (not yet implemented). See LightingVision.js.
 * ─────────────────────────────────────────────────────────────────
 */

import { Container, Graphics, RenderTexture, Sprite } from 'pixi.js'

export class LightingOverlay {
  constructor(renderer) {
    this.renderer = renderer
    this.container = new Container()
    this.container.eventMode = 'none'
    this._sprite = null
    this._rt = null
    this._darknessAlpha = 0.95
    this._ambientLight = 0
    this.visible = false
    /** When true, no darkness is applied — used for GM / view-all mode. */
    this.viewAll = false
  }

  get enabled() {
    return this.container.visible
  }

  set enabled(val) {
    this.container.visible = val
    if (!val) {
      this._clearLast()
    }
  }

  /**
   * @param {object} viewBounds  { x, y, width, height } in screen space
   * @param {object|null} visionData  Result from computeCombinedVision
   * @param {number} [ambientLight]  Scene ambient light factor 0-1
   */
  update(viewBounds, visionData, ambientLight) {
    if (!this.container.visible) return

    /* GM / view-all mode: no darkness overlay at all */
    if (this.viewAll) {
      this._clearLast()
      return
    }

    if (!visionData) {
      this._clearLast()
      return
    }

    if (ambientLight !== undefined) this._ambientLight = ambientLight
    const darknessAlpha = Math.max(0, this._darknessAlpha * (1 - this._ambientLight))

    const w = Math.ceil(viewBounds.width)
    const h = Math.ceil(viewBounds.height)
    if (w <= 0 || h <= 0) return

    this._ensureRT(w, h)

    const temp = new Container()

    /* ── Darkness layer ──────────────────────────────────────── */
    if (darknessAlpha > 0.01) {
      const dark = new Graphics()
      dark.rect(0, 0, w, h)
      dark.fill({ color: 0x000000, alpha: darknessAlpha })
      temp.addChild(dark)
    }

    /* ── Vision polygon cutouts (ERASE blend) ────────────────── */
    const allVisionPolys = visionData.visionPolygons ?? []
    if (visionData.visionPolygon) allVisionPolys.push(visionData.visionPolygon)

    for (const poly of allVisionPolys) {
      if (!poly || poly.length < 3) continue
      const hole = new Graphics()
      const pts = poly.flatMap(p => {
        const sp = this.renderer.worldToScreen(p.x, p.y)
        return [sp.x - viewBounds.x, sp.y - viewBounds.y]
      })
      if (pts.length >= 6) {
        hole.poly(pts)
        hole.fill({ color: 0xffffff, alpha: 1 })
        hole.blendMode = 'erase'
        temp.addChild(hole)
      }
    }

    /* ── Light polygons (ADD blend) ──────────────────────────── */
    if (visionData.lightPolygons?.length > 0) {
      for (const lp of visionData.lightPolygons) {
        const light = new Graphics()
        const pts = lp.points.flatMap(p => {
          const sp = this.renderer.worldToScreen(p.x, p.y)
          return [sp.x - viewBounds.x, sp.y - viewBounds.y]
        })
        if (pts.length >= 6) {
          light.poly(pts)
          const r = (lp.color >> 16) & 0xff
          const g = (lp.color >> 8) & 0xff
          const b = lp.color & 0xff
          const alpha = Math.min(lp.intensity * 0.3, 0.3)
          light.fill({ color: (r << 16) | (g << 8) | b, alpha })
          light.blendMode = 'add'
          temp.addChild(light)

          const glow = new Graphics()
          glow.poly(pts)
          glow.fill({ color: lp.color, alpha: alpha * 0.3 })
          glow.blendMode = 'add'
          temp.addChild(glow)
        }
      }
    }

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
  }

  destroy() {
    this._clearLast()
    this.container.destroy({ children: true })
  }
}
