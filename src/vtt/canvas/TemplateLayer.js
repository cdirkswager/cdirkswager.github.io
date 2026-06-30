import { Graphics, Container } from 'pixi.js'
import { getCoveredCells } from './CellCoverage.js'

const SHAPE_COLORS = {
  circle: 0x44aaff,
  cone: 0xff8844,
  line: 0x44ff88,
  rectangle: 0xaa44ff,
}

const FILL_ALPHA = 0.25
const OUTLINE_ALPHA = 0.8
const HANDLE_RADIUS = 6

/**
 * TemplateLayer — PixiJS rendering of persistent template shapes.
 *
 * Template fills render BELOW tokens (in sceneContainer ordering).
 * Outlines and selection handles render ABOVE tokens.
 *
 * This separation lets the user see their token on top of a
 * highlighted area while still seeing the full template boundary.
 */
export class TemplateLayer {
  constructor() {
    /* Fill layer — below tokens */
    this.fillContainer = new Container()
    this.fillContainer.eventMode = 'none'

    /* Outline + handle layer — above tokens */
    this.outlineContainer = new Container()
    this.outlineContainer.eventMode = 'none'

    this._selectedId = null
    this._graphics = new Map()  /* templateId -> { fill: Graphics, outline: Graphics } */
    this._scene = null
  }

  /**
   * Render (or re-render) all templates for the current scene.
   * @param {import('./Scene.js').Scene} scene
   */
  draw(scene) {
    this._scene = scene
    this._clear()
    if (!scene) return

    for (const tmpl of scene.templates) {
      this._addTemplate(tmpl)
    }
  }

  _addTemplate(tmpl) {
    if (!tmpl.visible) return

    const fillG = new Graphics()
    const outlineG = new Graphics()
    this._drawShape(fillG, tmpl, FILL_ALPHA, true)
    this._drawShape(outlineG, tmpl, OUTLINE_ALPHA, false)

    this.fillContainer.addChild(fillG)
    this.outlineContainer.addChild(outlineG)
    this._graphics.set(tmpl.id, { fill: fillG, outline: outlineG })
  }

  _drawShape(g, tmpl, alpha, isFill) {
    const color = SHAPE_COLORS[tmpl.type] ?? 0xffffff
    const { x, y, rotation } = tmpl

    if (isFill) {
      this._drawFilledShape(g, tmpl, color, alpha)
    } else {
      this._drawOutlinedShape(g, tmpl, color, alpha)
    }

    /* Selection handles */
    if (!isFill && tmpl.id === this._selectedId) {
      const handles = this._getHandlePositions(tmpl)
      for (const h of handles) {
        g.circle(h.x - x, h.y - y, HANDLE_RADIUS)
        g.fill({ color: 0xffffff, alpha: 0.9 })
        g.circle(h.x - x, h.y - y, HANDLE_RADIUS)
        g.setStrokeStyle({ width: 2, color: 0x000000, alpha: 0.5 })
        g.stroke()
      }
    }
  }

  _drawFilledShape(g, tmpl, color, alpha) {
    const { x, y, rotation } = tmpl

    switch (tmpl.type) {
      case 'circle':
        g.circle(0, 0, tmpl.radius)
        g.fill({ color, alpha })
        break

      case 'cone': {
        const halfAngle = tmpl.angle / 2
        g.moveTo(0, 0)
        const steps = 16
        for (let i = 0; i <= steps; i++) {
          const a = rotation - halfAngle + (i / steps) * tmpl.angle
          g.lineTo(Math.cos(a) * tmpl.length, Math.sin(a) * tmpl.length)
        }
        g.closePath()
        g.fill({ color, alpha })
        break
      }

      case 'line': {
        const perpX = Math.cos(rotation + Math.PI / 2) * tmpl.width / 2
        const perpY = Math.sin(rotation + Math.PI / 2) * tmpl.width / 2
        const dirX = Math.cos(rotation) * tmpl.length
        const dirY = Math.sin(rotation) * tmpl.length
        g.moveTo(perpX, perpY)
        g.lineTo(dirX + perpX, dirY + perpY)
        g.lineTo(dirX - perpX, dirY - perpY)
        g.lineTo(-perpX, -perpY)
        g.closePath()
        g.fill({ color, alpha })
        break
      }

      case 'rectangle': {
        const hw = tmpl.width / 2, hh = tmpl.height / 2
        g.rect(-hw, -hh, tmpl.width, tmpl.height)
        g.fill({ color, alpha })
        break
      }
    }
  }

  _drawOutlinedShape(g, tmpl, color, alpha) {
    const { x, y, rotation } = tmpl
    g.setStrokeStyle({ width: 2, color, alpha })

    switch (tmpl.type) {
      case 'circle':
        g.circle(0, 0, tmpl.radius)
        g.stroke()
        /* Center dot */
        g.circle(0, 0, 3)
        g.fill({ color, alpha })
        break

      case 'cone': {
        const halfAngle = tmpl.angle / 2
        g.moveTo(0, 0)
        const aStart = rotation - halfAngle
        g.lineTo(Math.cos(aStart) * tmpl.length, Math.sin(aStart) * tmpl.length)
        g.stroke()
        /* Arc at the end */
        const steps = 16
        g.moveTo(Math.cos(aStart) * tmpl.length, Math.sin(aStart) * tmpl.length)
        for (let i = 1; i <= steps; i++) {
          const a = aStart + (i / steps) * tmpl.angle
          g.lineTo(Math.cos(a) * tmpl.length, Math.sin(a) * tmpl.length)
        }
        g.stroke()
        /* Second side */
        const aEnd = rotation + halfAngle
        g.moveTo(Math.cos(aEnd) * tmpl.length, Math.sin(aEnd) * tmpl.length)
        g.lineTo(0, 0)
        g.stroke()
        break
      }

      case 'line': {
        const perpX = Math.cos(rotation + Math.PI / 2) * tmpl.width / 2
        const perpY = Math.sin(rotation + Math.PI / 2) * tmpl.width / 2
        const dirX = Math.cos(rotation) * tmpl.length
        const dirY = Math.sin(rotation) * tmpl.length
        g.moveTo(perpX, perpY)
        g.lineTo(dirX + perpX, dirY + perpY)
        g.lineTo(dirX - perpX, dirY - perpY)
        g.lineTo(-perpX, -perpY)
        g.closePath()
        g.stroke()
        /* Arrow at end (direction indicator) */
        const arrowSize = 8
        const tipX = dirX, tipY = dirY
        g.moveTo(tipX, tipY)
        g.lineTo(tipX - Math.cos(rotation - 0.4) * arrowSize, tipY - Math.sin(rotation - 0.4) * arrowSize)
        g.moveTo(tipX, tipY)
        g.lineTo(tipX - Math.cos(rotation + 0.4) * arrowSize, tipY - Math.sin(rotation + 0.4) * arrowSize)
        g.stroke()
        break
      }

      case 'rectangle': {
        const hw = tmpl.width / 2, hh = tmpl.height / 2
        const cosR = Math.cos(rotation), sinR = Math.sin(rotation)
        const corners = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]
        g.moveTo(corners[0][0], corners[0][1])
        for (let i = 1; i < 4; i++) {
          g.lineTo(corners[i][0], corners[i][1])
        }
        g.closePath()
        g.stroke()
        break
      }
    }
  }

  _getHandlePositions(tmpl) {
    const { x, y, rotation } = tmpl
    switch (tmpl.type) {
      case 'circle':
        return [{ x: x + tmpl.radius, y }, { x: x - tmpl.radius, y }]
      case 'cone':
        return [{ x: x + Math.cos(rotation) * tmpl.length, y: y + Math.sin(rotation) * tmpl.length }]
      case 'line':
        return [{ x: x + Math.cos(rotation) * tmpl.length, y: y + Math.sin(rotation) * tmpl.length }]
      case 'rectangle': {
        const hw = tmpl.width / 2, hh = tmpl.height / 2
        const cosR = Math.cos(rotation), sinR = Math.sin(rotation)
        return [
          { x: x + hw * cosR - hh * sinR, y: y + hw * sinR + hh * cosR },
        ]
      }
    }
    return []
  }

  /* ── Hit testing ─────────────────────────────────────────────── */

  hitTest(wx, wy) {
    if (!this._scene) return null
    /* Test in reverse (top-most template first) */
    const templates = this._scene.templates
    for (let i = templates.length - 1; i >= 0; i--) {
      const tmpl = templates[i]
      if (!tmpl.visible) continue
      /* Quick bounding-box check first */
      const { xMin, yMin, xMax, yMax } = this._getBounds(tmpl)
      if (wx < xMin || wx > xMax || wy < yMin || wy > yMax) continue
      /* Precise point-in-shape test */
      const dx = wx - tmpl.x, dy = wy - tmpl.y
      const dist = Math.hypot(dx, dy)
      const margin = 10 /* click tolerance */

      if (tmpl.type === 'circle') {
        if (Math.abs(dist - tmpl.radius) < margin) return tmpl
        if (dist <= tmpl.radius) return tmpl
      } else if (tmpl.type === 'cone') {
        if (dist <= tmpl.length) {
          const angleToPoint = Math.atan2(dy, dx)
          const halfAngle = tmpl.angle / 2
          let diff = angleToPoint - tmpl.rotation
          while (diff > Math.PI) diff -= Math.PI * 2
          while (diff < -Math.PI) diff += Math.PI * 2
          if (Math.abs(diff) <= halfAngle + 0.01) return tmpl
        }
      } else if (tmpl.type === 'line') {
        const dirX = Math.cos(tmpl.rotation)
        const dirY = Math.sin(tmpl.rotation)
        const t = dx * dirX + dy * dirY
        if (t >= -margin && t <= tmpl.length + margin) {
          const perpDist = Math.abs(-dirY * dx + dirX * dy)
          if (perpDist <= tmpl.width / 2 + margin) return tmpl
        }
      } else if (tmpl.type === 'rectangle') {
        const cosR = Math.cos(-tmpl.rotation)
        const sinR = Math.sin(-tmpl.rotation)
        const lx = dx * cosR - dy * sinR
        const ly = dx * sinR + dy * cosR
        if (Math.abs(lx) <= tmpl.width / 2 + margin &&
            Math.abs(ly) <= tmpl.height / 2 + margin) return tmpl
      }
    }
    return null
  }

  _getBounds(tmpl) {
    let xMin, yMin, xMax, yMax
    const { x, y, rotation } = tmpl

    function expand(px, py) {
      if (px < xMin) xMin = px
      if (py < yMin) yMin = py
      if (px > xMax) xMax = px
      if (py > yMax) yMax = py
    }

    if (tmpl.type === 'circle') {
      xMin = x - tmpl.radius; yMin = y - tmpl.radius
      xMax = x + tmpl.radius; yMax = y + tmpl.radius
    } else if (tmpl.type === 'cone') {
      xMin = x; yMin = y; xMax = x; yMax = y
      expand(x + Math.cos(rotation - tmpl.angle / 2) * tmpl.length, y + Math.sin(rotation - tmpl.angle / 2) * tmpl.length)
      expand(x + Math.cos(rotation + tmpl.angle / 2) * tmpl.length, y + Math.sin(rotation + tmpl.angle / 2) * tmpl.length)
      expand(x + Math.cos(rotation) * tmpl.length, y + Math.sin(rotation) * tmpl.length)
    } else if (tmpl.type === 'line') {
      const perpX = Math.cos(rotation + Math.PI / 2) * tmpl.width / 2
      const perpY = Math.sin(rotation + Math.PI / 2) * tmpl.width / 2
      const dirX = Math.cos(rotation) * tmpl.length
      const dirY = Math.sin(rotation) * tmpl.length
      xMin = Math.min(x + perpX, x + dirX + perpX, x + dirX - perpX, x - perpX)
      yMin = Math.min(y + perpY, y + dirY + perpY, y + dirY - perpY, y - perpY)
      xMax = Math.max(x + perpX, x + dirX + perpX, x + dirX - perpX, x - perpX)
      yMax = Math.max(y + perpY, y + dirY + perpY, y + dirY - perpY, y - perpY)
    } else if (tmpl.type === 'rectangle') {
      const hw = tmpl.width / 2, hh = tmpl.height / 2
      const cosR = Math.cos(rotation), sinR = Math.sin(rotation)
      xMin = Infinity; yMin = Infinity; xMax = -Infinity; yMax = -Infinity
      for (const [lx, ly] of [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]) {
        expand(x + lx * cosR - ly * sinR, y + lx * sinR + ly * cosR)
      }
    }

    return { xMin, yMin, xMax, yMax }
  }

  /* ── Selection ────────────────────────────────────────────────── */

  select(templateId) {
    this._selectedId = templateId
    this.draw(this._scene)
  }

  deselect() {
    this._selectedId = null
    this.draw(this._scene)
  }

  get selectedId() { return this._selectedId }

  /* ── Lifecycle ───────────────────────────────────────────────── */

  _clear() {
    this.fillContainer.removeChildren()
    this.outlineContainer.removeChildren()
    this._graphics.clear()
  }

  destroy() {
    this._clear()
    this.fillContainer.destroy({ children: true })
    this.outlineContainer.destroy({ children: true })
  }
}
