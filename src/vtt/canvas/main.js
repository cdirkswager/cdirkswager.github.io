import { CanvasRenderer } from './CanvasRenderer.js'
import { CanvasController } from './CanvasController.js'
import { Scene } from './Scene.js'
import { SceneManager } from './SceneManager.js'
import { Token } from './Token.js'
import { Tile } from './Tile.js'
import { Wall, WALL_TYPES } from './Wall.js'
import { Template, TEMPLATE_TYPES } from './Template.js'
import { WallLayer } from './WallLayer.js'
import { TemplateLayer } from './TemplateLayer.js'
import { RulerLayer } from './RulerLayer.js'
import { PingLayer } from './PingLayer.js'
import { LightingOverlay } from './LightingOverlay.js'
import { computeCombinedVision, computeVisionPolygon, computeLightPolygon } from './LightingVision.js'
import { EventBus } from './EventBus.js'
import { VttSyncClient } from './VttSyncClient.js'
import { registerRule, getRule, listRules, setActive, getActive, measure } from './DistanceRules.js'
import { getCoveredCells } from './CellCoverage.js'
import { WorldStore } from '../WorldStore.js'
import { createRenderSync } from '../RenderSync.js'

export {
  CanvasRenderer, CanvasController, Scene, SceneManager,
  Token, Tile, WALL_TYPES, Wall, WallLayer,
  Template, TEMPLATE_TYPES, TemplateLayer, RulerLayer, PingLayer,
  LightingOverlay,
  computeCombinedVision, computeVisionPolygon, computeLightPolygon,
  EventBus,
  registerRule, getRule, listRules, setActive, getActive, measure,
  getCoveredCells,
  VttSyncClient,
}

/**
 * createVttCanvas — mounts the Pixi canvas over an authoritative world.
 *
 * Redesigned model: the client INVENTS NOTHING. Pass a hydrated
 * WorldStore (options.world) built from the server snapshot; the canvas
 * is a projection of it (RenderSync). Offline/demo callers may omit
 * options.world, in which case an empty store hydrates locally and
 * fabricates its single starter scene.
 */
export async function createVttCanvas(mountEl, options = {}) {
  const renderer = new CanvasRenderer()
  await renderer.init(mountEl)

  const controller = new CanvasController(renderer)
  controller.enable()

  const eventBus = options.eventBus ?? new EventBus()

  /* The world: provided (connected) or locally hydrated (offline). */
  let world = options.world ?? null
  let _ownWorld = false
  if (!world) {
    world = new WorldStore(eventBus).bind()
    world.hydrate({}, null)
    _ownWorld = true
  }

  const sceneManager = new SceneManager({ world, renderer, controller, eventBus })

  /* The inventory system, loot panels, and GameActions item verbs all
     read controller.actorMap / controller.itemMap. Alias them to the
     WorldStore's maps — SAME Map references — so the store's single
     mutation router is what every reader sees. (The old bridge filled
     these from a second routing path; that path no longer exists.) */
  controller.actorMap = world.actors
  controller.itemMap = world.items

  renderer.rulerLayer.setEventBus(eventBus)
  renderer.pingLayer.setEventBus(eventBus)

  controller.onPing = (x, y) => {
    eventBus.emitEphemeral('ping', { x, y })
  }

  /* Base selection wiring: token clicks surface on the bus so the
     tactical layer (rings, range overlay, unit panel) can react.
     UI code may chain onTokenClicked; it should call the previous
     handler, as the cockpit already does. */
  controller.onTokenClicked = (token) => {
    eventBus.emit('token-selected', { tokenId: token?.id ?? null })
  }

  const canvasApi = {
    renderer,
    controller,
    world,
    /* Tactical grid snap for token drags (see VttSyncBridge drag-end). */
    gridSnap: true,
    get scene() { return sceneManager.activeScene },
    sceneManager,
    eventBus,
    addTile: (tileOpts) => {
      const s = sceneManager.activeScene
      const tile = new Tile(tileOpts)
      s.addTile(tile)
      renderer.addTile(tile)
      return tile
    },
    addToken: (tokenOpts) => {
      const s = sceneManager.activeScene
      const token = new Token({ ...tokenOpts, sceneId: s.id })
      s.addToken(token)
      renderer.addToken(token)
      return token
    },
    removeToken: (id) => renderer.removeToken(id),
    addWall: (wallOpts) => {
      const s = sceneManager.activeScene
      if (wallOpts instanceof Wall) {
        s.addWall(wallOpts)
      } else {
        s.addWall(new Wall(wallOpts))
      }
      renderer.redrawWalls()
      return s.walls[s.walls.length - 1]
    },
    removeWall: (id) => {
      const s = sceneManager.activeScene
      s.removeWall(id)
      renderer.redrawWalls()
    },
    addTemplate: (tmplOpts) => {
      const s = sceneManager.activeScene
      const tmpl = tmplOpts instanceof Template ? tmplOpts : new Template(tmplOpts)
      s.addTemplate(tmpl)
      renderer.templateLayer.draw(s)
      return tmpl
    },
    removeTemplate: (id) => {
      const s = sceneManager.activeScene
      s.removeTemplate(id)
      renderer.templateLayer.draw(s)
    },
    placeTemplate: (type, opts) => controller.placeTemplate(type, opts),
    clearRuler: () => controller.clearRuler(),
    setTool: (tool) => controller.setTool(tool),
    get tools() { return controller.TOOLS },
    setLightingEnabled: (enabled) => renderer.setLightingEnabled(enabled),
    setViewpoint: (tokenId) => controller.setViewpoint(tokenId),
    refreshLighting: () => controller.refreshLighting(),
    destroy: () => {
      renderSync.destroy()
      if (_ownWorld) world.destroy()
      controller.destroy()
      renderer.destroy()
      eventBus.destroy()
    },
    switchScene: (sceneId) => sceneManager.switchScene(sceneId),
  }

  /* Projection: the ONE render path (first paint, scene switches,
     incremental effects, resync after reconnect). */
  const renderSync = createRenderSync({ world, canvas: canvasApi, eventBus })

  return canvasApi
}
