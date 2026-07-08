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

export async function createVttCanvas(mountEl, options = {}) {
  const renderer = new CanvasRenderer()
  await renderer.init(mountEl)

  const controller = new CanvasController(renderer)
  controller.enable()

  const eventBus = options.eventBus ?? new EventBus()

  const scene = new Scene({
    name: options.sceneName ?? 'New Map',
    width: options.width ?? 4000,
    height: options.height ?? 3000,
    gridType: options.gridType ?? 'square',
    gridSize: options.gridSize ?? 100,
    backgroundColor: options.backgroundColor ?? '#2a2a2a',
  })
  scene._isLocalDefault = true

  const sceneManager = new SceneManager({ renderer, controller, eventBus })
  sceneManager.add(scene)

  if (options.sceneManagerData) {
    const restored = SceneManager.fromJSON(options.sceneManagerData, { renderer, controller, eventBus })
    for (const s of restored.scenes) {
      if (!sceneManager._scenes.has(s.id)) sceneManager.add(s)
    }
    if (restored._activeSceneId && restored._scenes.has(restored._activeSceneId)) {
      sceneManager._activeSceneId = restored._activeSceneId
    }
    for (const [userId, sceneId] of restored._userScenes) {
      sceneManager._userScenes.set(userId, sceneId)
    }
  }

  renderer.loadScene(sceneManager.activeScene)
  /* Ensure spatial index is rebuilt for any pre-existing scene walls */
  controller._spatialIndex.invalidate()
  controller.refreshLighting()
  renderer.rulerLayer.setEventBus(eventBus)
  renderer.pingLayer.setEventBus(eventBus)

  controller.onPing = (x, y) => {
    eventBus.emitEphemeral('ping', { x, y })
  }

  return {
    renderer,
    controller,
    get scene() { return sceneManager.activeScene },
    sceneManager,
    eventBus,
    addTile: (tileOpts) => {
      const s = sceneManager.activeScene
      const tile = new Tile(tileOpts)
      s.addTile(tile)
      renderer.loadScene(s)
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
      controller.destroy()
      renderer.destroy()
      eventBus.destroy()
    },
    switchScene: (sceneId) => sceneManager.switchScene(sceneId),
  }
}
