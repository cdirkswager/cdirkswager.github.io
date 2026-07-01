import { Application, Container, Sprite, Graphics, Texture } from 'pixi.js'
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

    this._setupResize(mountEl)
  }

  _setupResize(mountEl) {
    this._resizeObserver = new ResizeObserver(() => {
      if (!this.app?.renderer) return
      this.app.renderer.resize(mountEl.clientWidth, mountEl.clientHeight)
    })
    this._resizeObserver.observe(mountEl)
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
    sprite.x = token.x
    sprite.y = token.y
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
    wrapper.hitArea = sprite.getBounds()

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
    this.currentScene?.addToken(token)
    this._addTokenSprite(token)
  }

  removeToken(tokenId) {
    const entry = this.spriteMap.get(`token-${tokenId}`)
    if (entry) {
      this.tokenContainer.removeChild(entry.wrapper)
      entry.wrapper.destroy({ children: true })
      this.spriteMap.delete(`token-${tokenId}`)
    }
    this.currentScene?.removeToken(tokenId)
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
    if (this.app) {
      this.app.renderer.resize(this.app.canvas.parentElement.clientWidth, this.app.canvas.parentElement.clientHeight)
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
