import { Graphics } from 'pixi.js'
import { Wall } from './Wall.js'
import { Template } from './Template.js'
import { computeCombinedVision, WallSpatialIndex, perfStart, perfEnd } from './LightingVision.js'
import { getAccessLevel } from './ownership.js'

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
    this._lightingInvalidated = false

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
    this.actorMap = new Map()
    this.itemMap = new Map()

    this.onTokenMoved = null
    this.onTokenDragEnd = null
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
    if (this._viewpointTokenIds.length > 0) {
      this.renderer.setViewpointToken(this._viewpointTokenIds[0])
    } else {
      this.renderer.setViewpointToken(null)
    }
    this._lightingDirty = true
    this.refreshLighting()
  }

  /** Derive viewpoint from tokens whose actorId links to an actor
   *  the current user has `owner` access to. For non-DM players this
   *  is called after setup and whenever owned tokens/actors change. */
  syncViewpointToOwnedTokens() {
    if (this.isDm || !this.userId) return
    const scene = this.renderer.currentScene
    if (!scene) return
    const ids = scene.tokens
      .filter(t => {
        if (!t.actorId) return false
        const actor = this.actorMap?.get(t.actorId)
        return actor && getAccessLevel({ userId: this.userId, role: 'player' }, actor) === 'owner'
      })
      .map(t => t.id)
    this.setViewpoint(ids)
  }

  /** Set viewpoint to all tokens that contribute vision or light —
   *  shared wall-based dynamic lighting for all clients. */
  syncViewpointToAllVisionTokens() {
    const scene = this.renderer.currentScene
    if (!scene) return
    const ids = scene.tokens
      .filter(t => t.visionEnabled && (t.darkvisionRange > 0 || t.lightRadius > 0))
      .map(t => t.id)
    this.setViewpoint(ids)
  }

  refreshLighting() {
    if (!this.renderer) return
    const t0 = perfStart()
    const overlay = this.renderer.lightingOverlay
    if (!overlay?.enabled && !this.viewAll) return
    const scene = this.renderer.currentScene
    if (!scene) return

    overlay.viewAll = this.viewAll

    /* Always rebuild spatial index — walls must be indexed regardless
       of whether a viewpoint is currently set.  During init replay walls
       often load before tokens, and the index must be built to avoid the
       "unindexed walls" gap when the viewpoint is finally set. */
    this._spatialIndex.rebuildIfNeeded(scene.walls)

    if (this.viewAll) {
      overlay.update(null, null, scene.ambientLight ?? 0)
      this._lastVisionData = null
      perfEnd(t0, 'refreshLighting (viewAll)')
      return
    }

    if (!this._viewpointTokenIds.length) {
      overlay._clear()
      this._lastVisionData = null
      perfEnd(t0, 'refreshLighting (no viewpoint)')
      return
    }

    const vision = computeCombinedVision(
      scene.walls,
      scene.tokens,
      this._viewpointTokenIds,
      scene.ambientLight ?? 0,
      this._spatialIndex,
    )

    this.renderer.updateLighting(vision)
    this._lastVisionData = vision

    perfEnd(t0, 'refreshLighting')

    if (this.onVisionChanged && vision) {
      this.onVisionChanged({
        tokenIds: this._viewpointTokenIds,
        visionPolygons: vision.visionPolygons ?? (vision.visionPolygon ? [vision.visionPolygon] : []),
        timestamp: Date.now(),
      })
    }
  }

  /** Deferred lighting refresh — coalesces multiple invalidations
   *  into a single recompute via microtask.  Use in sync handlers
   *  where N records may be replayed synchronously (e.g. init wall
   *  replay) to avoid O(N) full recomputes. */
  invalidateLighting() {
    if (this._lightingInvalidated) return
    this._lightingInvalidated = true
    queueMicrotask(() => {
      this._lightingInvalidated = false
      this.refreshLighting()
    })
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
    const { x: cx, y: cy } = this.renderer.clientToCanvas(e.clientX, e.clientY)
    const world = this.renderer.screenToWorld(cx, cy)

    if (e.altKey) {
      this.onPing?.(world.x, world.y)
      return
    }

    if (this.tool === TOOLS.WALL_DRAW) {
      this._handleWallDrawDown(world)
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
    this._lightingDirty = true
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
    const { x: cx, y: cy } = this.renderer.clientToCanvas(e.clientX, e.clientY)
    const world = this.renderer.screenToWorld(cx, cy)

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
      const { x: cx, y: cy } = this.renderer.clientToCanvas(e.clientX, e.clientY)
      const world = this.renderer.screenToWorld(cx, cy)
      const scene = this.renderer.currentScene
      if (!scene) return
      const hitWall = this.renderer.wallLayer.hitTest(world.x, world.y, scene.walls)
      if (hitWall && hitWall.type === 'door') {
        const newState = hitWall.doorState === 'open' ? 'closed' : 'open'
        scene.updateWall(hitWall.id, { doorState: newState })
        this.renderer.redrawWalls()
        this._spatialIndex.invalidate()
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
      this._spatialIndex.invalidate()
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
    /* World-space overlay automatically tracks zoom — no refresh needed */
  }

  _canInteractWithToken(token) {
    if (this.isDm) return true
    if (!this.userId) return false
    if (token.actorId) {
      const actor = this.actorMap.get(token.actorId)
      if (actor) return getAccessLevel({ userId: this.userId, role: 'player' }, actor) === 'owner'
    }
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
    this._spatialIndex.invalidate()
    this.refreshLighting()
    this.onWallDeleted?.(this._selectedWall)
    this._selectedWall = null
    this.renderer.wallLayer.highlightWall(null)
  }

  destroy() {
    this.disable()
  }
}
