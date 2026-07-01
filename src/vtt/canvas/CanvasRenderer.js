import { Application, Container, Sprite, Graphics, Texture, Rectangle } from 'pixi.js'
import { Grid } from './Grid.js'
import { WallLayer } from './WallLayer.js'
import { LightingOverlay } from './LightingOverlay.js'
import { FogOfWar } from './FogOfWar.js'
import { TemplateLayer } from './TemplateLayer.js'
import { RulerLayer } from './RulerLayer.js'
import { PingLayer } from './PingLayer.js'

export class CanvasRenderer {
  constructor() {
    this.app = null
    this.sceneContainer = null
    this.tileContainer = null
    this.tokenContainer = null
    this.gridLayer = null
    this.wallLayer = null
    this.templateLayer = null
    this.rulerLayer = null
    this.lightingOverlay = null
    this.gizmoContainer = null
    this.pingLayer = null
    this.currentScene = null
    this.spriteMap = new Map()
    this.onTokenDragStart = null
    this.onTokenDragEnd = null
  }

  async init(mountEl, width, height) {
    this.app = new Application()
    await this.app.init({
      width: width ?? mountEl.clientWidth,
      height: height ?? mountEl.clientHeight,
      backgroundColor: 0x1a1a1a,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    })

    /* Style the canvas so it fills its container without affecting layout.
       This prevents the canvas from pushing mountEl larger (which would
       cause a ResizeObserver feedback loop). */
    this.app.canvas.style.position = 'absolute'
    this.app.canvas.style.top = '0'
    this.app.canvas.style.left = '0'
    this.app.canvas.style.width = '100%'
    this.app.canvas.style.height = '100%'
    this.app.canvas.style.display = 'block'

    mountEl.appendChild(this.app.canvas)

    this.sceneContainer = new Container()
    this.tileContainer = new Container()
    this.gridLayer = new Container()
    this.wallLayer = new WallLayer()
    this.tokenContainer = new Container()
    this.gizmoContainer = new Container()
    this.templateLayer = new TemplateLayer()
    this.rulerLayer = new RulerLayer()
    this.overlayContainer = new Container()
    this.fogOfWar = new FogOfWar(this)
    this.fogOfWar.enabled = false
    this.lightingOverlay = new LightingOverlay(this)
    this.lightingOverlay.enabled = false

    /* Order in sceneContainer (bottom to top):
       tiles → grid → template fills → walls → tokens → template outlines → gizmos */
    this.app.stage.addChild(this.sceneContainer)
    this.sceneContainer.addChild(this.tileContainer)
    this.sceneContainer.addChild(this.gridLayer)
    this.sceneContainer.addChild(this.templateLayer.fillContainer)
    this.sceneContainer.addChild(this.wallLayer.container)
    this.sceneContainer.addChild(this.tokenContainer)
    this.sceneContainer.addChild(this.templateLayer.outlineContainer)
    this.sceneContainer.addChild(this.gizmoContainer)
    /* Ruler lives in the gizmo container (top-most transient overlay) */
    this.gizmoContainer.addChild(this.rulerLayer.container)

    /* Ping layer renders above all scene containers */
    this.pingLayer = new PingLayer()
    this.sceneContainer.addChild(this.pingLayer.container)

    /* Overlay renders above everything in screen space — NOT inside
       sceneContainer, so darkness/vision/light stays fixed regardless
       of pan/zoom. */
    this.app.stage.addChild(this.overlayContainer)
    /* Fog layer renders below lighting overlay */
    this.overlayContainer.addChild(this.fogOfWar.container)
    this.overlayContainer.addChild(this.lightingOverlay.container)

    this._setupResize(mountEl, mountEl.parentElement)
  }

  _setupResize(mountEl, parentEl) {
    /* Observe the PARENT container, not mountEl itself.
       Resizing the canvas inside mountEl must never change what we observe —
       that is the root cause of the infinite grow loop. */
    const target = parentEl || mountEl

    this._pendingResize = false
    this._lastWidth = -1
    this._lastHeight = -1

    this._resizeObserver = new ResizeObserver(() => {
      if (!this.app?.renderer) return
      /* Debounce: coalesce multiple fires into one rAF tick */
      if (this._pendingResize) return
      this._pendingResize = true
      requestAnimationFrame(() => {
        this._pendingResize = false
        const w = Math.round(target.clientWidth)
        const h = Math.round(target.clientHeight)
        /* Ignore zero/degenerate sizes */
        if (w < 1 || h < 1) return
        /* Only resize when integer dimensions actually changed */
        if (w === this._lastWidth && h === this._lastHeight) return
        this._lastWidth = w
        this._lastHeight = h
        this.app.renderer.resize(w, h)
      })
    })
    this._resizeObserver.observe(target)
  }

  loadScene(scene) {
    this.currentScene = scene
    this._clearContainers()

    const grid = new Grid(scene)
    grid.draw()
    this.gridLayer.addChild(grid.container)
    this._currentGrid = grid

    for (const tile of scene.tiles) {
      this._addTileSprite(tile)
    }

    this.wallLayer.draw(scene.walls)
    this.templateLayer.draw(scene)

    for (const token of scene.tokens) {
      this._addTokenSprite(token)
    }

    /* Update ruler grid info */
    this.rulerLayer.setGrid(scene.gridSize, scene.gridType)
  }

  redrawWalls() {
    if (this.currentScene) {
      this.wallLayer.draw(this.currentScene.walls)
    }
  }

  _clearContainers() {
    this.tileContainer.removeChildren()
    this.tokenContainer.removeChildren()
    this.gizmoContainer.removeChildren()
    this.gridLayer.removeChildren()
    if (this.wallLayer) {
      this.sceneContainer.removeChild(this.wallLayer.container)
      this.wallLayer.destroy()
    }
    this.wallLayer = new WallLayer()
    this.sceneContainer.addChildAt(this.wallLayer.container, this.sceneContainer.getChildIndex(this.gridLayer) + 1)
    this.templateLayer?._clear()
    this.spriteMap.clear()
    this._currentGrid?.destroy()
    this._currentGrid = null
  }

  getViewBounds() {
    const w = this.app.renderer.width
    const h = this.app.renderer.height
    return { x: 0, y: 0, width: w, height: h, world: this.screenToWorld(0, 0) }
  }

  updateLighting(visionData) {
    if (!this.lightingOverlay?.enabled) return
    const bounds = this.getViewBounds()
    const ambient = this.currentScene?.ambientLight ?? 0
    this.lightingOverlay.update(bounds, visionData, ambient)
  }

  setLightingEnabled(enabled) {
    if (this.lightingOverlay) {
      this.lightingOverlay.enabled = enabled
      if (!enabled) this.lightingOverlay._clearLast()
    }
  }

  async _addTileSprite(tile) {
    const sprite = Sprite.from(tile.src)
    sprite.x = tile.x
    sprite.y = tile.y
    sprite.width = tile.width
    sprite.height = tile.height
    sprite.rotation = tile.rotation
    sprite.eventMode = 'none'
    this.tileContainer.addChild(sprite)
    this.spriteMap.set(`tile-${tile.id}`, { type: 'tile', data: tile, sprite })
  }

  async _addTokenSprite(token) {
    const tex = token.src ? await Texture.from(token.src) : this._makePlaceholderTex(token)
    const sprite = new Sprite(tex)
    sprite.width = token.width
    sprite.height = token.height
    sprite.rotation = token.rotation
    sprite.alpha = token.visible ? 1 : 0.3
    sprite.eventMode = 'static'
    sprite.cursor = token.locked ? 'default' : 'grab'
    sprite.label = token.name

    const outline = new Graphics()
    outline.rect(0, 0, token.width, token.height)
    outline.fill({ color: 0x00aaff, alpha: 0 })
    outline.setStrokeStyle({ width: 2, color: 0xffffff, alpha: 0.5 })
    outline.stroke()
    outline.eventMode = 'none'

    const wrapper = new Container()
    wrapper.addChild(outline)
    wrapper.addChild(sprite)
    wrapper.x = token.x
    wrapper.y = token.y
    wrapper.eventMode = 'static'
    wrapper.cursor = token.locked ? 'default' : 'grab'
    wrapper.hitArea = new Rectangle(0, 0, token.width, token.height)

    this.tokenContainer.addChild(wrapper)
    this.spriteMap.set(`token-${token.id}`, { type: 'token', data: token, sprite, wrapper, outline })
  }

  _makePlaceholderTex(token) {
    const g = new Graphics()
    g.rect(0, 0, token.width, token.height)
    g.fill({ color: 0x4a6fa5 })
    g.rect(8, 8, token.width - 16, token.height - 16)
    g.fill({ color: 0x3a5a8a })
    return this.app.renderer.generateTexture(g)
  }

  addToken(token) {
    this._addTokenSprite(token)
  }

  removeToken(tokenId) {
    const entry = this.spriteMap.get(`token-${tokenId}`)
    if (entry) {
      this.tokenContainer.removeChild(entry.wrapper)
      entry.wrapper.destroy({ children: true })
      this.spriteMap.delete(`token-${tokenId}`)
    }
  }

  updateTokenPosition(tokenId, x, y) {
    const entry = this.spriteMap.get(`token-${tokenId}`)
    if (!entry) return
    entry.data.x = x
    entry.data.y = y
    entry.wrapper.x = x
    entry.wrapper.y = y
  }

  pan(dx, dy) {
    this.sceneContainer.x += dx
    this.sceneContainer.y += dy
  }

  zoom(delta, cx, cy) {
    const oldScale = this.sceneContainer.scale.x
    const newScale = Math.max(0.1, Math.min(5, oldScale * (delta > 0 ? 1.1 : 0.9)))
    if (newScale === oldScale) return

    const worldPos = this._screenToWorld(cx, cy)
    this.sceneContainer.scale.set(newScale)
    const newScreen = this._worldToScreen(worldPos.x, worldPos.y)
    this.sceneContainer.x += cx - newScreen.x
    this.sceneContainer.y += cy - newScreen.y
  }

  screenToWorld(sx, sy) {
    return this._screenToWorld(sx, sy)
  }

  _screenToWorld(sx, sy) {
    const inv = this.sceneContainer.worldTransform.clone().invert()
    return inv.apply({ x: sx, y: sy })
  }

  worldToScreen(wx, wy) {
    return this._worldToScreen(wx, wy)
  }

  _worldToScreen(wx, wy) {
    return this.sceneContainer.worldTransform.apply({ x: wx, y: wy })
  }

  snap(x, y) {
    return this._currentGrid ? this._currentGrid.snap(x, y) : { x, y }
  }

  resize() {
    if (!this.app || !this._resizeObserver) return
    /* Invalidate the cached size so the next rAF tick will actually resize */
    this._lastWidth = -1
    this._lastHeight = -1
    const w = Math.round(this.app.canvas.parentElement.clientWidth)
    const h = Math.round(this.app.canvas.parentElement.clientHeight)
    if (w > 0 && h > 0) {
      this.app.renderer.resize(w, h)
    }
  }

  destroy() {
    this._resizeObserver?.disconnect()
    this._currentGrid?.destroy()
    this.wallLayer?.destroy()
    this.templateLayer?.destroy()
    this.rulerLayer?.destroy()
    this.pingLayer?.destroy()
    this.fogOfWar?.destroy()
    this.lightingOverlay?.destroy()
    this.app?.destroy(true)
  }
}
