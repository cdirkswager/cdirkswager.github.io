import { Container, Graphics } from 'pixi.js'

const PING_COLORS = [0x00aaff, 0xff4444, 0x44ff44, 0xffaa00, 0xff44ff, 0x44ffff, 0xff8844, 0x88ff44]

export class PingLayer {
  constructor() {
    this.container = new Container()
    this.container.eventMode = 'none'
    this._eventBus = null
    this._unsub = null
    this._currentSceneId = null
  }

  setCurrentSceneId(sceneId) {
    this._currentSceneId = sceneId
  }

  setEventBus(bus) {
    if (this._unsub) this._unsub()
    this._eventBus = bus
    if (bus) {
      this._unsub = bus.on('ephemeral', (e) => {
        if (e.type === 'ping') {
          /* Only show pings for the scene the viewer is currently on.
             Local pings always pass through (no sceneId filtering for own
             actions); remote pings must match the current scene. */
          if (e.sceneId && e.sceneId !== this._currentSceneId && e.origin !== 'local') return
          const fromUserId = e.fromUserId || 'local'
          const fromUsername = e.fromUsername || ''
          this.showPing(e.x, e.y, fromUserId, fromUsername)
        }
      })
    }
  }

  showPing(x, y, userId, username) {
    const color = this._colorFor(userId)
    const g = new Graphics()
    g.circle(0, 0, 24)
    g.setStrokeStyle({ width: 3, color, alpha: 0.8 })
    g.stroke()
    g.circle(0, 0, 6)
    g.fill({ color, alpha: 1 })

    const wrapper = new Container()
    wrapper.addChild(g)
    wrapper.x = x
    wrapper.y = y
    wrapper.scale.set(0.5)

    this.container.addChild(wrapper)

    const start = performance.now()
    const duration = 1800

    const animate = () => {
      const t = (performance.now() - start) / duration
      if (t >= 1) {
        if (wrapper.parent) {
          this.container.removeChild(wrapper)
          wrapper.destroy({ children: true })
        }
        return
      }
      if (t < 0.4) {
        const s = 0.5 + t * 2.5
        wrapper.scale.set(s)
      } else {
        wrapper.scale.set(1.5)
      }
      if (t > 0.5) {
        wrapper.alpha = 1 - (t - 0.5) * 2
      } else {
        wrapper.alpha = 1
      }
      requestAnimationFrame(animate)
    }
    requestAnimationFrame(animate)
  }

  _colorFor(userId) {
    let hash = 0
    for (let i = 0; i < userId.length; i++) {
      hash = ((hash << 5) - hash) + userId.charCodeAt(i)
      hash |= 0
    }
    return PING_COLORS[Math.abs(hash) % PING_COLORS.length]
  }

  destroy() {
    if (this._unsub) this._unsub()
    this.container.destroy({ children: true })
  }
}
