/**
 * Template — persistent area-of-effect shape.
 *
 * Four types: circle, cone, line/ray, rectangle.
 *
 * Targeting seam (Stage 5):
 *   Call `getCoveredCells(gridType, gridSize)` to retrieve the set
 *   of grid cells this template covers (implemented in CellCoverage.js).
 *   A future targeting system will call this method and test tokens
 *   against the returned cells to determine who is inside the template.
 *
 * Seam for permissions:
 *   `owner` — playerId of the player who placed this template.
 *   Server should enforce: GM may edit/delete any; player may edit/delete
 *   only their own (owner === playerId).
 */

const TEMPLATE_TYPES = ['circle', 'cone', 'line', 'rectangle']

export { TEMPLATE_TYPES }

export class Template {
  constructor({
    id, type, x, y, rotation,
    /* circle */
    radius,
    /* cone */
    angle, length,
    /* line/ray */
    width, length: lineLength,
    /* rectangle */
    width: rectWidth, height: rectHeight,
    owner, visible,
  } = {}) {
    this.id = id ?? crypto.randomUUID()
    this.type = type ?? 'circle'
    if (!TEMPLATE_TYPES.includes(this.type)) throw new Error(`Unknown template type: ${this.type}`)

    this.x = x ?? 0
    this.y = y ?? 0
    this.rotation = rotation ?? 0

    switch (this.type) {
      case 'circle':
        this.radius = radius ?? 100
        break
      case 'cone':
        this.angle = angle ?? (Math.PI / 3)  /* 60 degrees */
        this.length = lineLength ?? length ?? 200
        break
      case 'line':
        this.length = lineLength ?? length ?? 200
        this.width = width ?? 50
        break
      case 'rectangle':
        this.width = rectWidth ?? width ?? 200
        this.height = rectHeight ?? height ?? 200
        break
    }

    this.owner = owner ?? null
    this.visible = visible ?? true
  }

  toJSON() {
    const base = {
      id: this.id,
      type: this.type,
      x: this.x,
      y: this.y,
      rotation: this.rotation,
      owner: this.owner,
      visible: this.visible,
    }
    switch (this.type) {
      case 'circle': base.radius = this.radius; break
      case 'cone':   base.angle = this.angle; base.length = this.length; break
      case 'line':   base.length = this.length; base.width = this.width; break
      case 'rectangle': base.width = this.width; base.height = this.height; break
    }
    return base
  }
}
