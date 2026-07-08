export class Tile {
  constructor({ id, src, x, y, width, height, rotation, zIndex } = {}) {
    this.id = id ?? crypto.randomUUID()
    this.src = src ?? ''
    this.x = x ?? 0
    this.y = y ?? 0
    this.width = width ?? 800
    this.height = height ?? 600
    this.rotation = rotation ?? 0
    this.zIndex = zIndex ?? 0
  }

  toJSON() {
    return {
      id: this.id,
      src: this.src,
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      rotation: this.rotation,
      zIndex: this.zIndex,
    }
  }
}
