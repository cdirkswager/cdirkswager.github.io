import { Graphics } from 'pixi.js'
import { Wall } from './Wall.js'
import { Template } from './Template.js'
import { computeCombinedVision, WallSpatialIndex, perfStart, perfEnd } from './LightingVision.js'

const TOOLS = { PAN: 'pan', TOKEN: 'token', WALL_DRAW: 'wall-draw', WALL_SELECT: 'wall-select', RULER: 'ruler', TEMPLATE: 'template' }

export class CanvasController {
  constructor(renderer) {
    this.renderer = renderer
    this.active = false
    this._dragTarget = null
    this._dragOffset = { x: 0, y: 0 }
    this._panning = false
    this._panStart = { x: 0, y: 0 }
    this._panOrigin = { x: 0, y: 0 }

    this.tool = TOOLS.PAN
    this.gridSnap = true
    this._wallDrawStart = null
    this._wallPreview = null
    this._selectedWall = null
    this._wallDrawSnap = true
    this._viewpointTokenIds = []
    this._lightingDirty = true

    /* Ruler state */
    this._rulerActive = false

    /* Template state */
    this._selectedTemplate = null
    this._templateDragOffset = { x: 0, y: 0 }
    this._templateDragHandle = null  /* 'move', 'resize', or null */

    /* Token hover feedback */
    this._hoveredTokenId = null

    /** When true, the lighting overlay is bypassed (GM sees all). */
    this.viewAll = false
    /** Current scene ambient light factor 0-1. */
    this.ambientLight = 0
    /** Previously computed vision data — Fog of War seam. */
    this._lastVisionData = null
    /** Spatial index over walls, rebuilt on wall change. */
    this._spatialIndex = new WallSpatialIndex()

    /* Permission — set by the host after construction */
    this.userId = null
    this.isDm = false

    this.onTokenMoved = null
    this.onTokenClicked = null
    this.onSceneClicked = null
    this.onWallCreated = null
    this.onWallSelected = null
    this.onWallDeleted = null
    this.onDoorToggled = null
    this.onTemplateCreated = null
    this.onTemplateSelected = null
    this.onTemplateMoved = null
    this.onTemplateDeleted = null
    this.onVisionChanged = null
    this.onPing = null

    this.TOOLS = TOOLS

    /* Keyboard listener */
    this._onKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (this._rulerActive) {
          this.clearRuler()
        }
        if (this._selectedTemplate) {
          this._deselectTemplate()
        }
        if (this._selectedWall) {
          this._selectedWall = null
          this.renderer.wallLayer.highlightWall(null)
        }
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (this._selectedTemplate) {
          this.deleteSelectedTemplate()
        } else if (this._selectedWall) {
          this.deleteSelectedWall()
        }
      }
    }
  }

  setTool(tool) {
    if (this.tool === TOOLS.RULER && tool !== TOOLS.RULER) {
      this.clearRuler()
    }
    this.tool = tool
    this._wallDrawStart = null
    this._clearWallPreview()
    this._selectedWall = null
    this.renderer.wallLayer.highlightWall(null)
    this._deselectTemplate()
    if (tool === TOOLS.WALL_DRAW) {
      this.renderer.app.canvas.style.cursor = 'crosshair'
    } else {
      this.renderer.app.canvas.style.cursor = 'default'
    }
  }

  setViewpoint(tokenIds) {
    this._viewpointTokenIds = Array.isArray(tokenIds) ? tokenIds : [tokenIds]
    this._lightingDirty = true
    this.refreshLighting()
  }

  refreshLighting() {
    const t0 = perfStart()
    const overlay = this.renderer.lightingOverlay
    const fog = this.renderer.fogOfWar
    if (!overlay?.enabled && !this.viewAll) return
    const scene = this.renderer.currentScene
    if (!scene) return
    const bounds = this.renderer.getViewBounds()

    overlay.viewAll = this.viewAll

    if (this.viewAll) {
      overlay.update(bounds, null, this.ambientLight)
      if (fog?.enabled) fog.update(bounds)
      this._lastVisionData = null
      perfEnd(t0, 'refreshLighting (viewAll)')
      return
    }

    if (!this._viewpointTokenIds.length) {
      overlay._clearLast()
      if (fog?.enabled) fog.update(bounds)
      this._lastVisionData = null
      perfEnd(t0, 'refreshLighting (no viewpoint)')
      return
    }

    this._spatialIndex.rebuildIfNeeded(scene.walls)

    const vision = computeCombinedVision(
      scene.walls,
      scene.tokens,
      this._viewpointTokenIds,
      scene.ambientLight ?? this.ambientLight,
      this._spatialIndex,
    )

    this.renderer.updateLighting(vision)
    this._lastVisionData = vision

    if (fog?.enabled && vision) {
      const polys = vision.visionPolygons ?? (vision.visionPolygon ? [vision.visionPolygon] : [])
      fog.accumulate(polys)
      fog.update(bounds)
    }

    perfEnd(t0, 'refreshLighting')

    if (this.onVisionChanged && vision) {
      this.onVisionChanged({
        tokenIds: this._viewpointTokenIds,
        visionPolygons: vision.visionPolygons ?? (vision.visionPolygon ? [vision.visionPolygon] : []),
        timestamp: Date.now(),
      })
    }
  }

  enable() {
    if (this.active) return
    this.active = true
    const canvas = this.renderer.app.canvas
    canvas.addEventListener('pointerdown', this._onPointerDown)
    canvas.addEventListener('pointermove', this._onPointerMove)
    canvas.addEventListener('pointerup', this._onPointerUp)
    canvas.addEventListener('wheel', this._onWheel, { passive: false })
    canvas.addEventListener('dblclick', this._onDoubleClick)
    canvas.addEventListener('contextmenu', this._onContextMenu)
    window.addEventListener('keydown', this._onKeyDown)
  }

  disable() {
    if (!this.active) return
    this.active = false
    const canvas = this.renderer.app.canvas
    canvas.removeEventListener('pointerdown', this._onPointerDown)
    canvas.removeEventListener('pointermove', this._onPointerMove)
    canvas.removeEventListener('pointerup', this._onPointerUp)
    canvas.removeEventListener('wheel', this._onWheel)
    canvas.removeEventListener('dblclick', this._onDoubleClick)
    canvas.removeEventListener('contextmenu', this._onContextMenu)
    window.removeEventListener('keydown', this._onKeyDown)
    this._dragTarget = null
    this._panning = false
    this._clearWallPreview()
  }

  /* ── Ruler ─────────────────────────────────────────────────── */

  clearRuler() {
    this._rulerActive = false
    this.renderer.rulerLayer.clear()
  }

  /* ── Templates ─────────────────────────────────────────────── */

  placeTemplate(type, opts = {}) {
    const scene = this.renderer.currentScene
    if (!scene) return null
    const tmpl = new Template({ type, ...opts })
    scene.addTemplate(tmpl)
    this.renderer.templateLayer.draw(scene)
    this._selectedTemplate = tmpl
    this.renderer.templateLayer.select(tmpl.id)
    this.onTemplateCreated?.(tmpl)
    return tmpl
  }

  deleteSelectedTemplate() {
    if (!this._selectedTemplate) return
    const scene = this.renderer.currentScene
    if (!scene) return
    const id = this._selectedTemplate.id
    scene.removeTemplate(id)
    this.renderer.templateLayer.draw(scene)
    this.onTemplateDeleted?.(this._selectedTemplate)
    this._selectedTemplate = null
  }

  _deselectTemplate() {
    this._selectedTemplate = null
    this._templateDragHandle = null
    this.renderer.templateLayer.deselect()
  }

  /* ── Pointer handlers ──────────────────────────────────────── */

  _onPointerDown = (e) => {
    try {
      this._handlePointerDown(e)
    } catch (err) {
      console.error('[CanvasController] _onPointerDown error:', err)
      this._dragTarget = null
      this._panning = false
    }
  }

  _handlePointerDown = (e) => {
    if (e.button === 2) return  /* right-click handled by contextmenu */
    const world = this.renderer.screenToWorld(e.clientX, e.clientY)

    if (e.altKey) {
      this.onPing?.(world.x, world.y)
      return
    }

    if (this.tool === TOOLS.WALL_DRAW) {
      this._handleWallDrawDown(world)
      this._spatialDirty = true
      return
    }

    if (this.tool === TOOLS.RULER) {
      this._handleRulerDown(world)
      return
    }

    if (this.tool === TOOLS.TEMPLATE) {
      this._handleTemplateDown(world, e)
      return
    }

    if (this.tool === TOOLS.WALL_SELECT) {
      const hitWall = this.renderer.wallLayer.hitTest(world.x, world.y, this.renderer.currentScene?.walls || [])
      if (hitWall) {
        this._selectedWall = hitWall
        this.renderer.wallLayer.highlightWall(hitWall.id)
        this.onWallSelected?.(hitWall)
        return
      }
      this._selectedWall = null
      this.renderer.wallLayer.highlightWall(null)
    }

    const tokenEntry = this._hitTestToken(world.x, world.y)
    if (tokenEntry && !tokenEntry.data.locked && this.tool !== TOOLS.PAN) {
      this._dragTarget = tokenEntry
      this._dragOffset = {
        x: world.x - tokenEntry.data.x,
        y: world.y - tokenEntry.data.y,
      }
      tokenEntry.sprite.cursor = 'grabbing'
      tokenEntry.wrapper.cursor = 'grabbing'
      this.onTokenClicked?.(tokenEntry.data)
      return
    }

    this._panning = true
    this._panStart = { x: e.clientX, y: e.clientY }
    this._panOrigin = {
      x: this.renderer.sceneContainer.x,
      y: this.renderer.sceneContainer.y,
    }
    this.onSceneClicked?.(world.x, world.y)
  }

  _onPointerMove = (e) => {
    try {
      this._handlePointerMove(e)
    } catch (err) {
      console.error('[CanvasController] _onPointerMove error:', err)
      this._dragTarget = null
      this._panning = false
    }
  }

  _handlePointerMove = (e) => {
    const world = this.renderer.screenToWorld(e.clientX, e.clientY)

    if (this.tool === TOOLS.WALL_DRAW && this._wallDrawStart) {
      this._updateWallPreview(world)
      return
    }

    if (this.tool === TOOLS.RULER && this._rulerActive) {
      this._handleRulerMove(world)
      return
    }

    if (this.tool === TOOLS.TEMPLATE && this._selectedTemplate && this._templateDragHandle) {
      this._handleTemplateMove(world)
      return
    }

    if (this.tool === TOOLS.TOKEN && !this._dragTarget) {
      this._updateTokenHover(world)
    }

    if (this._dragTarget) {
      let nx = world.x - this._dragOffset.x
      let ny = world.y - this._dragOffset.y
      if (this.gridSnap) {
        const snapped = this.renderer.snap(nx, ny)
        nx = snapped.x; ny = snapped.y
      }
      this.renderer.updateTokenPosition(this._dragTarget.data.id, nx, ny)
      this._lightingDirty = true
      this.onTokenMoved?.(this._dragTarget.data, nx, ny)
      return
    }

    if (this._panning) {
      const dx = e.clientX - this._panStart.x
      const dy = e.clientY - this._panStart.y
      this.renderer.sceneContainer.x = this._panOrigin.x + dx
      this.renderer.sceneContainer.y = this._panOrigin.y + dy
    }
  }

  _onPointerUp = () => {
    try {
      this._handlePointerUp()
    } catch (err) {
      console.error('[CanvasController] _onPointerUp error:', err)
      this._dragTarget = null
      this._panning = false
    }
  }

  _handlePointerUp = () => {
    if (this._dragTarget) {
      this._dragTarget.sprite.cursor = 'grab'
      this._dragTarget.wrapper.cursor = 'grab'
      this.onTokenDragEnd?.(this._dragTarget.data)
      this._dragTarget = null
    }
    this._panning = false
    this._templateDragHandle = null
    if (this._lightingDirty) {
      this.refreshLighting()
      this._lightingDirty = false
    }
  }

  _onDoubleClick = (e) => {
    if (this.tool === TOOLS.WALL_SELECT) {
      const world = this.renderer.screenToWorld(e.clientX, e.clientY)
      const scene = this.renderer.currentScene
      if (!scene) return
      const hitWall = this.renderer.wallLayer.hitTest(world.x, world.y, scene.walls)
      if (hitWall && hitWall.type === 'door') {
        const newState = hitWall.doorState === 'open' ? 'closed' : 'open'
        scene.updateWall(hitWall.id, { doorState: newState })
        this.renderer.redrawWalls()
        this._spatialDirty = true
        this.refreshLighting()
        this.onDoorToggled?.(hitWall, newState)
      }
    }
  }

  _onContextMenu = (e) => {
    e.preventDefault()
    if (this.tool === TOOLS.RULER && this._rulerActive) {
      this.clearRuler()
    }
  }

  /* ── Ruler handlers ────────────────────────────────────────── */

  _handleRulerDown(world) {
    const ruler = this.renderer.rulerLayer
    let sx = world.x, sy = world.y
    if (this.gridSnap) {
      const snapped = this.renderer.snap(sx, sy)
      sx = snapped.x; sy = snapped.y
    }
    if (!this._rulerActive) {
      ruler.start(sx, sy)
      this._rulerActive = true
    } else {
      /* Add waypoint */
      ruler.addWaypoint(sx, sy)
    }
  }

  _handleRulerMove(world) {
    const ruler = this.renderer.rulerLayer
    let ex = world.x, ey = world.y
    if (this.gridSnap) {
      const snapped = this.renderer.snap(ex, ey)
      ex = snapped.x; ey = snapped.y
    }
    ruler.updateEndpoint(ex, ey)
  }

  /* ── Template handlers ──────────────────────────────────────── */

  _handleTemplateDown(world, e) {
    const scene = this.renderer.currentScene
    if (!scene) return

    /* Check if clicking on existing template */
    const hit = this.renderer.templateLayer.hitTest(world.x, world.y)
    if (hit) {
      this._selectedTemplate = hit
      this.renderer.templateLayer.select(hit.id)
      this._templateDragOffset = {
        x: world.x - hit.x,
        y: world.y - hit.y,
      }
      this._templateDragHandle = 'move'
      this.onTemplateSelected?.(hit)
      return
    }

    /* Click on empty space: deselect */
    this._deselectTemplate()
  }

  _handleTemplateMove(world) {
    if (!this._selectedTemplate) return
    const tmpl = this._selectedTemplate

    if (this._templateDragHandle === 'move') {
      let nx = world.x - this._templateDragOffset.x
      let ny = world.y - this._templateDragOffset.y
      if (this.gridSnap) {
        const snapped = this.renderer.snap(nx, ny)
        nx = snapped.x; ny = snapped.y
      }
      tmpl.x = nx
      tmpl.y = ny
      this.renderer.templateLayer.draw(tmpl.constructor === Template ? null : null) /* redraw needed */
      /* Force full redraw via scene */
      this.renderer.templateLayer.draw(this.renderer.currentScene)
      this.onTemplateMoved?.(tmpl, nx, ny)
    }
  }

  /* ── Wall handlers ──────────────────────────────────────────── */

  _handleWallDrawDown(world) {
    const scene = this.renderer.currentScene
    if (!scene) return

    if (!this._wallDrawStart) {
      let sx = world.x, sy = world.y
      if (this._wallDrawSnap) {
        const snapped = this.renderer.snap(sx, sy)
        sx = snapped.x; sy = snapped.y
      }
      this._wallDrawStart = { x: sx, y: sy }
      this._updateWallPreview({ x: sx, y: sy })
      return
    }

    let ex = world.x, ey = world.y
    if (this._wallDrawSnap) {
      const snapped = this.renderer.snap(ex, ey)
      ex = snapped.x; ey = snapped.y
    }

    const wall = new Wall({
      x: this._wallDrawStart.x,
      y: this._wallDrawStart.y,
      x2: ex, y2: ey,
      type: 'solid',
    })

    if (wall.length > 5) {
      scene.addWall(wall)
      this.renderer.redrawWalls()
      this._spatialDirty = true
      this.refreshLighting()
      this.onWallCreated?.(wall)
    }

    this._wallDrawStart = { x: ex, y: ey }
    this._updateWallPreview({ x: ex, y: ey })
  }

  _updateWallPreview(world) {
    if (!this._wallDrawStart) return
    this._clearWallPreview()
    const g = new Graphics()
    let ex = world.x, ey = world.y
    if (this._wallDrawSnap) {
      const snapped = this.renderer.snap(ex, ey)
      ex = snapped.x; ey = snapped.y
    }
    g.setStrokeStyle({ width: 3, color: 0xffffff, alpha: 0.5 })
    g.moveTo(this._wallDrawStart.x, this._wallDrawStart.y)
    g.lineTo(ex, ey)
    g.stroke()
    g.circle(this._wallDrawStart.x, this._wallDrawStart.y, 5)
    g.fill({ color: 0xffffff, alpha: 0.7 })
    this.renderer.gizmoContainer.addChild(g)
    this._wallPreview = g
  }

  _clearWallPreview() {
    if (this._wallPreview) {
      this.renderer.gizmoContainer.removeChild(this._wallPreview)
      this._wallPreview.destroy()
      this._wallPreview = null
    }
  }

  _onWheel = (e) => {
    e.preventDefault()
    this.renderer.zoom(e.deltaY < 0 ? 1 : -1, e.clientX, e.clientY)
    this.refreshLighting()
  }

  _canInteractWithToken(token) {
    if (this.isDm) return true
    if (!this.userId) return false
    return token.userId === this.userId
  }

  _hitTestToken(wx, wy) {
    const entries = []
    for (const [key, entry] of this.renderer.spriteMap) {
      if (!key.startsWith('token-')) continue
      const t = entry.data
      if (!this._canInteractWithToken(t)) continue
      if (wx >= t.x && wx <= t.x + t.width && wy >= t.y && wy <= t.y + t.height) {
        entries.push(entry)
      }
    }
    if (entries.length === 0) return null
    entries.sort((a, b) => a.data.zIndex ?? 0 - (b.data.zIndex ?? 0))
    return entries[entries.length - 1]
  }

  _setTokenOutline(entry, { width, color, alpha }) {
    const t = entry.data
    entry.outline.clear()
    entry.outline.rect(0, 0, t.width, t.height)
    entry.outline.fill({ color: 0x00aaff, alpha: 0 })
    entry.outline.setStrokeStyle({ width, color, alpha })
    entry.outline.stroke()
  }

  _updateTokenHover(world) {
    const tokenEntry = this._hitTestToken(world.x, world.y)
    const hoveredId = tokenEntry ? tokenEntry.data.id : null

    if (hoveredId === this._hoveredTokenId) return

    /* Un-highlight previous */
    if (this._hoveredTokenId) {
      const prev = this.renderer.spriteMap.get(`token-${this._hoveredTokenId}`)
      if (prev) {
        this._setTokenOutline(prev, { width: 2, color: 0xffffff, alpha: 0.5 })
      }
    }

    /* Highlight new */
    if (tokenEntry) {
      this._setTokenOutline(tokenEntry, { width: 3, color: 0xffcc00, alpha: 1 })
      this.renderer.app.canvas.style.cursor = 'pointer'
    } else {
      this.renderer.app.canvas.style.cursor = this.tool === TOOLS.WALL_DRAW ? 'crosshair' : 'default'
    }

    this._hoveredTokenId = hoveredId
  }

  deleteSelectedWall() {
    if (!this._selectedWall) return
    const scene = this.renderer.currentScene
    if (!scene) return
    scene.removeWall(this._selectedWall.id)
    this.renderer.redrawWalls()
    this._spatialDirty = true
    this.refreshLighting()
    this.onWallDeleted?.(this._selectedWall)
    this._selectedWall = null
    this.renderer.wallLayer.highlightWall(null)
  }

  destroy() {
    this.disable()
  }
}
