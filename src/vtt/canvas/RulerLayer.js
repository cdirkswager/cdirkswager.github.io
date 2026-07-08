import { Graphics, Container, Text } from 'pixi.js'
import { measure } from './DistanceRules.js'

/**
 * RulerLayer — ephemeral distance measurement overlay.
 *
 * Renders a multi-segment path with distance labels.
 * The ruler is transient (not persisted) and renders at full framerate.
 *
 * Seam for pings/cursors (Stage 3):
 *   The `ephemeral` channel on the EventBus is the same mechanism
 *   used here for live ruler sharing. To add pings or cursors,
 *   emit on 'ephemeral' with a different type, e.g.:
 *     bus.emitEphemeral('ping', { x, y, playerId, color })
 *   The ruler uses type 'ruler-update' and 'ruler-clear'.
 */
export class RulerLayer {
  constructor(gridSize = 100, gridType = 'square', gridUnit = 5, gridUnitLabel = 'ft') {
    this.container = new Container()
    this.container.eventMode = 'none'
    this.container.visible = false

    this._graphics = new Graphics()
    this._labels = []
    this.container.addChild(this._graphics)

    this._waypoints = []
    this._gridSize = gridSize
    this._gridType = gridType
    this._gridUnit = gridUnit
    this._gridUnitLabel = gridUnitLabel
    this._eventBus = null
    this._lastBroadcastAt = 0
    this._trailingTimer = null
  }

  /** Attach an event bus for ephemeral broadcast. */
  setEventBus(bus) {
    this._eventBus = bus
  }

  setGrid(gridSize, gridType, gridUnit, gridUnitLabel) {
    this._gridSize = gridSize
    this._gridType = gridType
    if (gridUnit !== undefined) this._gridUnit = gridUnit
    if (gridUnitLabel !== undefined) this._gridUnitLabel = gridUnitLabel
  }

  /** Start a new ruler at (wx, wy). */
  start(wx, wy) {
    this._waypoints = [{ x: wx, y: wy }]
    this.container.visible = true
    this._render()
    this._broadcast()
  }

  /** Add a waypoint (intermediate point). */
  addWaypoint(wx, wy) {
    this._waypoints.push({ x: wx, y: wy })
    this._render()
    this._broadcast()
  }

  /** Update the current (final) endpoint during drag. */
  updateEndpoint(wx, wy) {
    if (this._waypoints.length === 0) {
      this._waypoints = [{ x: wx, y: wy }]
    } else if (this._waypoints.length === 1) {
      this._waypoints.push({ x: wx, y: wy })
    } else {
      this._waypoints[this._waypoints.length - 1] = { x: wx, y: wy }
    }
    this.container.visible = true
    this._render()
    this._broadcast()
  }

  /** Clear the ruler. */
  clear() {
    /* Cancel any queued trailing update so it can't arrive after the clear. */
    if (this._trailingTimer) {
      clearTimeout(this._trailingTimer)
      this._trailingTimer = null
    }
    this._waypoints = []
    this.container.visible = false
    this._render()
    if (this._eventBus) {
      this._eventBus.emitEphemeral('ruler-clear', {})
    }
  }

  _render() {
    const g = this._graphics
    g.clear()

    if (this._waypoints.length < 2) return

    /* Remove old text labels */
    for (const t of this._labels) {
      this.container.removeChild(t)
      t.destroy()
    }
    this._labels = []

    /* Draw path */
    g.setStrokeStyle({ width: 2, color: 0xffdd44, alpha: 0.9 })
    g.moveTo(this._waypoints[0].x, this._waypoints[0].y)
    for (let i = 1; i < this._waypoints.length; i++) {
      g.lineTo(this._waypoints[i].x, this._waypoints[i].y)
    }
    g.stroke()

    /* Draw endpoints and waypoints */
    for (const wp of this._waypoints) {
      g.circle(wp.x, wp.y, 4)
      g.fill({ color: 0xffdd44, alpha: 1 })
    }

    /* Distance labels */
    let totalCells = 0
    for (let i = 1; i < this._waypoints.length; i++) {
      const a = this._waypoints[i - 1]
      const b = this._waypoints[i]
      const cells = measure(a.x, a.y, b.x, b.y, this._gridSize, this._gridType)
      totalCells += cells

      const dist = cells * this._gridUnit
      const label = new Text({
        text: `${dist.toFixed(1)} ${this._gridUnitLabel}`,
        style: {
          fontSize: 12,
          fill: 0xffdd44,
          fontFamily: 'monospace',
          align: 'center',
          stroke: { color: 0x000000, width: 3 },
        },
      })
      label.anchor.set(0.5, 0)
      label.x = (a.x + b.x) / 2
      label.y = (a.y + b.y) / 2 - 16
      this.container.addChild(label)
      this._labels.push(label)
    }

    /* Total label at the end */
    if (this._waypoints.length >= 2) {
      const last = this._waypoints[this._waypoints.length - 1]
      const totalDist = totalCells * this._gridUnit
      const total = new Text({
        text: `Total: ${totalDist.toFixed(1)} ${this._gridUnitLabel}`,
        style: {
          fontSize: 13,
          fill: 0xffffff,
          fontFamily: 'monospace',
          align: 'center',
          fontWeight: 'bold',
          stroke: { color: 0x000000, width: 3 },
        },
      })
      total.anchor.set(0.5, 1)
      total.x = last.x
      total.y = last.y - 12
      this.container.addChild(total)
      this._labels.push(total)
    }
  }

  _broadcast() {
    if (!this._eventBus) return
    /* Throttle to ~30 Hz with a trailing send. Unthrottled, this fired per
       pointermove (up to 120+/sec), and each message costs a full
       stringify → WS → server relay → N× parse → redraw round trip. The
       trailing timer guarantees the final ruler position is always sent. */
    const now = Date.now()
    const interval = 33
    if (this._lastBroadcastAt && now - this._lastBroadcastAt < interval) {
      if (!this._trailingTimer) {
        this._trailingTimer = setTimeout(() => {
          this._trailingTimer = null
          this._sendBroadcast()
        }, interval - (now - this._lastBroadcastAt))
      }
      return
    }
    this._sendBroadcast()
  }

  _sendBroadcast() {
    if (!this._eventBus) return
    this._lastBroadcastAt = Date.now()
    this._eventBus.emitEphemeral('ruler-update', {
      waypoints: this._waypoints.map(wp => ({ x: wp.x, y: wp.y })),
      gridSize: this._gridSize,
      gridType: this._gridType,
      gridUnit: this._gridUnit,
      gridUnitLabel: this._gridUnitLabel,
    })
  }

  destroy() {
    if (this._trailingTimer) {
      clearTimeout(this._trailingTimer)
      this._trailingTimer = null
    }
    for (const t of this._labels) {
      this.container.removeChild(t)
      t.destroy()
    }
    this._labels = []
    this._graphics.destroy()
    this.container.destroy({ children: true })
  }
}
