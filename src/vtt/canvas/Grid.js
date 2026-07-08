import { Graphics, Container } from 'pixi.js'

export class Grid {
  constructor(scene) {
    this.scene = scene
    this.container = new Container()
    this.graphics = new Graphics()
    this.container.addChild(this.graphics)
    this.container.eventMode = 'none'
  }

  draw() {
    const g = this.graphics
    g.clear()

    const { width, height, gridType, gridSize, backgroundColor } = this.scene

    // Background fill
    g.rect(0, 0, width, height).fill({ color: backgroundColor })

    if (gridType === 'none') return

    const gridColor = 0xffffff
    const gridAlpha = 0.12

    if (gridType === 'square') {
      g.setStrokeStyle({ width: 1, color: gridColor, alpha: gridAlpha })
      for (let x = 0; x <= width; x += gridSize) {
        g.moveTo(x, 0).lineTo(x, height)
      }
      for (let y = 0; y <= height; y += gridSize) {
        g.moveTo(0, y).lineTo(width, y)
      }
      g.stroke()
    } else if (gridType === 'hex') {
      const r = gridSize / Math.sqrt(3)
      const w = r * Math.sqrt(3)
      const h = gridSize

      g.setStrokeStyle({ width: 1, color: gridColor, alpha: gridAlpha })
      for (let row = -1; row < Math.ceil(height / h) + 1; row++) {
        const cols = Math.ceil(width / w) + 2
        for (let col = -1; col < cols; col++) {
          const offsetX = (row % 2 === 0) ? 0 : w * 0.5
          const cx = col * w + offsetX
          const cy = row * h * 0.75
          this._drawHex(g, cx, cy, r)
        }
      }
      g.stroke()
    }
  }

  _drawHex(g, cx, cy, r) {
    const pts = []
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 6
      pts.push(cx + r * Math.cos(angle), cy + r * Math.sin(angle))
    }
    g.moveTo(pts[0], pts[1])
    for (let i = 2; i < pts.length; i += 2) {
      g.lineTo(pts[i], pts[i + 1])
    }
    g.closePath()
  }

  snap(x, y) {
    if (this.scene.gridType === 'none') return { x, y }
    const s = this.scene.gridSize
    if (this.scene.gridType === 'hex') return this._snapHex(x, y)
    return {
      x: Math.round(x / s) * s,
      y: Math.round(y / s) * s,
    }
  }

  _snapHex(x, y) {
    const { gridSize } = this.scene
    const r = gridSize / Math.sqrt(3)
    const w = r * Math.sqrt(3)
    const h = gridSize
    const row = Math.round(y / (h * 0.75))
    const offsetX = (row % 2 === 0) ? 0 : w * 0.5
    const col = Math.round((x - offsetX) / w)
    return {
      x: col * w + offsetX,
      y: row * h * 0.75,
    }
  }

  destroy() {
    this.graphics.destroy()
    this.container.destroy({ children: true })
  }
}
