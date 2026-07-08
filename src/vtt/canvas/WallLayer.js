import { Container, Graphics } from 'pixi.js'

const COLORS = {
  'solid': { stroke: 0xe74c3c, fill: 0xc0392b, alpha: 0.9, width: 6 },
  'door': { stroke: 0x2ecc71, fill: 0x27ae60, alpha: 0.9, width: 5 },
  'secret': { stroke: 0xf1c40f, fill: 0xf39c12, alpha: 0.8, width: 5 },
  'see-through': { stroke: 0x3498db, fill: 0x2980b9, alpha: 0.6, width: 4 },
  'terrain': { stroke: 0x8b5e3c, fill: 0x6d4427, alpha: 0.7, width: 4 },
}

const HIT_EXTRA = 8

export class WallLayer {
  constructor() {
    this.container = new Container()
    this.container.eventMode = 'none'
    this.graphics = new Graphics()
    this.hitGraphics = new Graphics()
    this.hitGraphics.eventMode = 'none'
    this.wallContainers = []
    this.selectedWallId = null
    this.onWallClick = null
    this.onWallDoubleClick = null
  }

  draw(walls) {
    this.container.removeChildren()
    this.graphics = new Graphics()
    this.hitGraphics = new Graphics()
    this.container.addChild(this.graphics)
    this.container.addChild(this.hitGraphics)
    this.wallContainers = []

    const g = this.graphics
    const hg = this.hitGraphics

    for (const wall of walls) {
      const c = COLORS[wall.type] || COLORS['solid']

      if (wall.hidden && wall.type !== 'secret') continue

      if (wall.type === 'secret' && wall.hidden) {
        this._drawDashedLine(g, wall.x, wall.y, wall.x2, wall.y2, c.stroke, c.alpha, c.width)
      } else if (wall.type === 'door') {
        this._drawDoor(g, wall, c)
      } else {
        g.setStrokeStyle({ width: c.width, color: c.stroke, alpha: c.alpha })
        g.moveTo(wall.x, wall.y)
        g.lineTo(wall.x2, wall.y2)
        g.stroke()
      }

      const hitW = c.width + HIT_EXTRA * 2
      hg.setStrokeStyle({ width: hitW, color: 0xffffff, alpha: 0 })
      hg.moveTo(wall.x, wall.y)
      hg.lineTo(wall.x2, wall.y2)
      hg.stroke()

      this.wallContainers.push({ wall, hitW })
    }
  }

  _drawDoor(g, wall, c) {
    const open = wall.doorState === 'open'
    const mx = (wall.x + wall.x2) / 2
    const my = (wall.y + wall.y2) / 2
    const dx = wall.x2 - wall.x
    const dy = wall.y2 - wall.y
    const len = Math.hypot(dx, dy)
    const nx = -dy / len
    const ny = dx / len

    g.setStrokeStyle({ width: c.width, color: c.stroke, alpha: c.alpha })
    if (open) {
      const gap = 12
      const half = len / 2
      const segLen = half - gap / 2
      const t1 = segLen / len
      g.moveTo(wall.x, wall.y)
      g.lineTo(wall.x + dx * t1, wall.y + dy * t1)
      g.moveTo(wall.x2 - dx * t1, wall.y2 - dy * t1)
      g.lineTo(wall.x2, wall.y2)
      g.stroke()
      const arcR = 10
      g.arc(mx + nx * arcR, my + ny * arcR, arcR, Math.atan2(-dy, -dx), Math.atan2(dy, dx))
      g.setStrokeStyle({ width: 2, color: c.stroke, alpha: 0.5 })
      g.stroke()
    } else {
      g.moveTo(wall.x, wall.y)
      g.lineTo(wall.x2, wall.y2)
      g.stroke()
      g.circle(mx, my, 5)
      g.fill({ color: c.stroke, alpha: c.alpha })
    }
  }

  _drawDashedLine(g, x1, y1, x2, y2, color, alpha, width) {
    const dx = x2 - x1, dy = y2 - y1
    const len = Math.hypot(dx, dy)
    const segs = Math.floor(len / 14)
    const dashLen = len / (segs * 2)
    const ux = dx / len, uy = dy / len
    g.setStrokeStyle({ width, color, alpha })
    for (let i = 0; i < segs * 2; i += 2) {
      const s = i * dashLen
      const e = (i + 1) * dashLen
      g.moveTo(x1 + ux * s, y1 + uy * s)
      g.lineTo(x1 + ux * e, y1 + uy * e)
    }
    g.stroke()
  }

  highlightWall(wallId) {
    this.selectedWallId = wallId
    this.draw(this._currentWalls || [])
    if (!wallId) return
    const wall = this._currentWalls?.find(w => w.id === wallId)
    if (!wall) return
    const sel = new Graphics()
    sel.setStrokeStyle({ width: 3, color: 0xffffff, alpha: 1 })
    sel.moveTo(wall.x, wall.y)
    sel.lineTo(wall.x2, wall.y2)
    sel.stroke()
    this.container.addChild(sel)
  }

  hitTest(wx, wy, walls) {
    this._currentWalls = walls
    let closest = null
    let closestDist = 15
    for (const wall of walls) {
      const c = COLORS[wall.type] || COLORS['solid']
      const dist = wall.distanceTo(wx, wy)
      const threshold = Math.max(c.width, 4) + HIT_EXTRA
      if (dist < threshold && dist < closestDist) {
        closest = wall
        closestDist = dist
      }
    }
    return closest
  }

  destroy() {
    this.container.destroy({ children: true })
  }
}
