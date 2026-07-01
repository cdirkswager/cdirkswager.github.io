import { CanvasRenderer } from './CanvasRenderer.js'
import { CanvasController } from './CanvasController.js'
import { Scene } from './Scene.js'
import { Token } from './Token.js'
import { Tile } from './Tile.js'
import { Wall, WALL_TYPES } from './Wall.js'
import { Template, TEMPLATE_TYPES } from './Template.js'
import { WallLayer } from './WallLayer.js'
import { TemplateLayer } from './TemplateLayer.js'
import { RulerLayer } from './RulerLayer.js'
import { PingLayer } from './PingLayer.js'
import { LightingOverlay } from './LightingOverlay.js'
import { FogOfWar } from './FogOfWar.js'
import { computeCombinedVision, computeVisionPolygon, computeLightPolygon } from './LightingVision.js'
import { EventBus } from './EventBus.js'
import { VttSyncClient } from './VttSyncClient.js'
import { registerRule, getRule, listRules, setActive, getActive, measure } from './DistanceRules.js'
import { getCoveredCells } from './CellCoverage.js'

export {
  CanvasRenderer, CanvasController, Scene,
  Token, Tile, WALL_TYPES, Wall, WallLayer,
  Template, TEMPLATE_TYPES, TemplateLayer, RulerLayer, PingLayer,
  LightingOverlay, FogOfWar,
  computeCombinedVision, computeVisionPolygon, computeLightPolygon,
  EventBus,
  registerRule, getRule, listRules, setActive, getActive, measure,
  getCoveredCells,
  VttSyncClient,
}

export async function createVttCanvas(mountEl, options = {}) {
  const renderer = new CanvasRenderer()
  await renderer.init(mountEl, mountEl.parentElement)

  const controller = new CanvasController(renderer)
  controller.enable()

  const scene = new Scene({
    name: options.sceneName ?? 'New Map',
    width: options.width ?? 4000,
    height: options.height ?? 3000,
    gridType: options.gridType ?? 'square',
    gridSize: options.gridSize ?? 100,
    backgroundColor: options.backgroundColor ?? '#2a2a2a',
  })

  const eventBus = options.eventBus ?? new EventBus()

  renderer.loadScene(scene)
  renderer.rulerLayer.setEventBus(eventBus)
  renderer.pingLayer.setEventBus(eventBus)

  controller.onPing = (x, y) => {
    eventBus.emitEphemeral('ping', { x, y })
  }

  return {
    renderer,
    controller,
    scene,
    eventBus,
    addTile: (tileOpts) => {
      const tile = new Tile(tileOpts)
      scene.addTile(tile)
      renderer.loadScene(scene)
      return tile
    },
    addToken: (tokenOpts) => {
      const token = new Token(tokenOpts)
      scene.addToken(token)
      renderer.addToken(token)
      return token
    },
    removeToken: (id) => renderer.removeToken(id),
    addWall: (wallOpts) => {
      if (wallOpts instanceof Wall) {
        scene.addWall(wallOpts)
      } else {
        scene.addWall(new Wall(wallOpts))
      }
      renderer.redrawWalls()
      return scene.walls[scene.walls.length - 1]
    },
    removeWall: (id) => {
      scene.removeWall(id)
      renderer.redrawWalls()
    },
    addTemplate: (tmplOpts) => {
      const tmpl = tmplOpts instanceof Template ? tmplOpts : new Template(tmplOpts)
      scene.addTemplate(tmpl)
      renderer.templateLayer.draw(scene)
      return tmpl
    },
    removeTemplate: (id) => {
      scene.removeTemplate(id)
      renderer.templateLayer.draw(scene)
    },
    placeTemplate: (type, opts) => controller.placeTemplate(type, opts),
    clearRuler: () => controller.clearRuler(),
    setTool: (tool) => controller.setTool(tool),
    get tools() { return controller.TOOLS },
    setLightingEnabled: (enabled) => renderer.setLightingEnabled(enabled),
    setFogEnabled: (enabled) => { renderer.fogOfWar.enabled = enabled; controller.refreshLighting() },
    resetFog: () => { renderer.fogOfWar.reset(); controller.refreshLighting() },
    setViewpoint: (tokenId) => controller.setViewpoint(tokenId),
    refreshLighting: () => controller.refreshLighting(),
    destroy: () => {
      controller.destroy()
      renderer.destroy()
      eventBus.destroy()
    },
  }
}
