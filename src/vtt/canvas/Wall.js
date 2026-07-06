export const WALL_TYPES = ['solid', 'door', 'secret', 'see-through', 'terrain']

export class Wall {
  constructor({ id, x, y, x2, y2, type, doorState, hidden } = {}) {
    this.id = id ?? crypto.randomUUID()
    this.x = x ?? 0
    this.y = y ?? 0
    this.x2 = x2 ?? 100
    this.y2 = y2 ?? 100
    this.type = WALL_TYPES.includes(type) ? type : 'solid'
    this.doorState = doorState !== undefined ? doorState : (this.type === 'door' ? 'closed' : null)
    this.hidden = hidden !== undefined ? hidden : (this.type === 'secret')
  }

  get midpoint() {
    return { x: (this.x + this.x2) / 2, y: (this.y + this.y2) / 2 }
  }

  get length() {
    return Math.hypot(this.x2 - this.x, this.y2 - this.y)
  }

  toJSON() {
    return {
      id: this.id,
      x: this.x, y: this.y,
      x2: this.x2, y2: this.y2,
      type: this.type,
      doorState: this.doorState,
      hidden: this.hidden,
    }
  }

  static distanceToSegment(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay
    const lenSq = dx * dx + dy * dy
    if (lenSq === 0) return Math.hypot(px - ax, py - ay)
    let t = ((px - ax) * dx + (py - ay) * dy) / lenSq
    t = Math.max(0, Math.min(1, t))
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
  }

  distanceTo(px, py) {
    return Wall.distanceToSegment(px, py, this.x, this.y, this.x2, this.y2)
  }

  intersectsRect(rx, ry, rw, rh) {
    const { x: ax, y: ay, x2: bx, y2: by } = this
    const left = rx, right = rx + rw, top = ry, bottom = ry + rh

    if (ax >= left && ax <= right && ay >= top && ay <= bottom) return true
    if (bx >= left && bx <= right && by >= top && by <= bottom) return true

    const edges = [
      [[left, top], [right, top]],
      [[right, top], [right, bottom]],
      [[right, bottom], [left, bottom]],
      [[left, bottom], [left, top]],
    ]
    for (const [[ex1, ey1], [ex2, ey2]] of edges) {
      if (this._segmentsIntersect(ax, ay, bx, by, ex1, ey1, ex2, ey2)) return true
    }
    return false
  }

  _segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
    const d1 = this._cross(cx, cy, dx, dy, ax, ay)
    const d2 = this._cross(cx, cy, dx, dy, bx, by)
    const d3 = this._cross(ax, ay, bx, by, cx, cy)
    const d4 = this._cross(ax, ay, bx, by, dx, dy)
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
        ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true
    if (d1 === 0 && this._onSeg(cx, cy, dx, dy, ax, ay)) return true
    if (d2 === 0 && this._onSeg(cx, cy, dx, dy, bx, by)) return true
    if (d3 === 0 && this._onSeg(ax, ay, bx, by, cx, cy)) return true
    if (d4 === 0 && this._onSeg(ax, ay, bx, by, dx, dy)) return true
    return false
  }

  _cross(ax, ay, bx, by, cx, cy) {
    return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
  }

  _onSeg(ax, ay, bx, by, cx, cy) {
    return Math.min(ax, bx) <= cx && cx <= Math.max(ax, bx) &&
           Math.min(ay, by) <= cy && cy <= Math.max(ay, by)
  }
}
