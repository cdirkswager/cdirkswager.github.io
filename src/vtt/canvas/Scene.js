import { Tile } from './Tile.js'
import { Token } from './Token.js'
import { Wall } from './Wall.js'
import { Template } from './Template.js'

export class Scene {
  constructor({ id, name, width, height, gridType, gridSize, gridUnit, gridUnitLabel, backgroundColor, ambientLight } = {}) {
    this.id = id ?? crypto.randomUUID()
    this.name = name ?? 'New Scene'
    this.width = width ?? 4000
    this.height = height ?? 3000
    this.gridType = gridType ?? 'square'
    this.gridSize = gridSize ?? 100
    this.gridUnit = gridUnit ?? 5
    this.gridUnitLabel = gridUnitLabel ?? 'ft'
    this.backgroundColor = backgroundColor ?? '#2a2a2a'
    this.ambientLight = ambientLight ?? 0
    this.tiles = []
    this.tokens = []
    this.walls = []
    this.templates = []
  }

  addTile(tile) {
    this.tiles.push(tile)
  }

  removeTile(tileId) {
    this.tiles = this.tiles.filter(t => t.id !== tileId)
  }

  addToken(token) {
    this.tokens.push(token)
  }

  removeToken(tokenId) {
    this.tokens = this.tokens.filter(t => t.id !== tokenId)
  }

  getToken(id) {
    return this.tokens.find(t => t.id === id)
  }

  updateToken(tokenId, changes) {
    const t = this.getToken(tokenId)
    if (!t) return null
    Object.assign(t, changes)
    return t
  }

  addWall(wall) {
    this.walls.push(wall)
  }

  removeWall(wallId) {
    this.walls = this.walls.filter(w => w.id !== wallId)
  }

  getWall(id) {
    return this.walls.find(w => w.id === id)
  }

  updateWall(wallId, changes) {
    const w = this.getWall(wallId)
    if (!w) return null
    Object.assign(w, changes)
    return w
  }

  addTemplate(tmpl) {
    this.templates.push(tmpl)
  }

  removeTemplate(templateId) {
    this.templates = this.templates.filter(t => t.id !== templateId)
  }

  getTemplate(id) {
    return this.templates.find(t => t.id === id)
  }

  updateTemplate(templateId, changes) {
    const t = this.getTemplate(templateId)
    if (!t) return null
    Object.assign(t, changes)
    return t
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      width: this.width,
      height: this.height,
      gridType: this.gridType,
      gridSize: this.gridSize,
      gridUnit: this.gridUnit,
      gridUnitLabel: this.gridUnitLabel,
      backgroundColor: this.backgroundColor,
      ambientLight: this.ambientLight,
      tiles: this.tiles.map(t => t.toJSON()),
      tokens: this.tokens.map(t => t.toJSON()),
      walls: this.walls.map(w => w.toJSON()),
      templates: this.templates.map(t => t.toJSON()),
    }
  }

  static fromJSON(data) {
    const scene = new Scene(data)
    scene.tiles = (data.tiles ?? []).map(td => Object.assign(new Tile(), td))
    scene.tokens = (data.tokens ?? []).map(td => Object.assign(new Token(), td))
    scene.walls = (data.walls ?? []).map(wd => Object.assign(new Wall(), wd))
    scene.templates = (data.templates ?? []).map(td => Object.assign(new Template(), td))
    return scene
  }
}
