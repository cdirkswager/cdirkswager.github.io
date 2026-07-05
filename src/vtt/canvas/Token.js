export class Token {
  constructor({ id, name, src, x, y, width, height, rotation, locked, visible, elevation, sightRange, visionEnabled, darkvisionRange, lightRadius, lightColor, lightIntensity, userId, actorId } = {}) {
    this.id = id ?? crypto.randomUUID()
    this.name = name ?? 'Token'
    this.src = src ?? ''
    this.x = x ?? 0
    this.y = y ?? 0
    this.width = width ?? 100
    this.height = height ?? 100
    this.rotation = rotation ?? 0
    this.locked = locked ?? false
    this.visible = visible ?? true
    this.elevation = elevation ?? 0
    this.sightRange = sightRange ?? 0
    this.visionEnabled = visionEnabled ?? false
    this.darkvisionRange = darkvisionRange ?? 0
    this.lightRadius = lightRadius ?? 0
    this.lightColor = lightColor ?? 0xffeedd
    this.lightIntensity = lightIntensity ?? 1
    this.userId = userId ?? null
    this.actorId = actorId ?? null
  }

  get centerX() { return this.x + this.width / 2 }
  get centerY() { return this.y + this.height / 2 }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      src: this.src,
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      rotation: this.rotation,
      locked: this.locked,
      visible: this.visible,
      elevation: this.elevation,
      sightRange: this.sightRange,
      visionEnabled: this.visionEnabled,
      darkvisionRange: this.darkvisionRange,
      lightRadius: this.lightRadius,
      lightColor: this.lightColor,
      lightIntensity: this.lightIntensity,
      userId: this.userId,
      actorId: this.actorId,
    }
  }
}
