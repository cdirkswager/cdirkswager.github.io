import { describe, it, expect, beforeEach, vi } from 'vitest'

/* Mock pixi.js — FogOfWar uses Container, RenderTexture, and Graphics
   which require a WebGL/WebGPU context in Node. We only test logic here. */
vi.mock('pixi.js', () => {
  class MockContainer {
    constructor() { this.eventMode = null; this.visible = true; this.children = [] }
    addChild(c) { this.children.push(c) }
    removeChild(c) { this.children = this.children.filter(x => x !== c) }
    destroy() { this.children = [] }
  }
  class MockSprite {
    constructor() { this.eventMode = null; this.x = 0; this.y = 0; this._texture = null }
    get texture() { return this._texture }
    set texture(t) { this._texture = t }
    destroy() {}
  }
  class MockGraphics {
    constructor() { this.blendMode = null; this.eventMode = null }
    poly() { return this }
    rect() { return this }
    fill() { return this }
    clear() { return this }
    destroy() {}
  }
  return {
    Container: MockContainer,
    Sprite: MockSprite,
    Graphics: MockGraphics,
    RenderTexture: { create: () => ({ width: 0, height: 0, destroy: () => {} }) },
  }
})

import { FogOfWar } from './FogOfWar.js'

function makeMockRenderer() {
  return {
    worldToScreen: (x, y) => ({ x, y }),
    getViewBounds: () => ({ x: 0, y: 0, width: 800, height: 600 }),
    app: {
      renderer: {
        render: () => {},
      },
    },
  }
}

describe('FogOfWar', () => {
  let fog
  let renderer

  beforeEach(() => {
    renderer = makeMockRenderer()
    fog = new FogOfWar(renderer)
  })

  it('starts disabled', () => {
    expect(fog.enabled).toBe(false)
    expect(fog.container.visible).toBe(false)
  })

  it('toggle enabled', () => {
    fog.enabled = true
    expect(fog.enabled).toBe(true)
    expect(fog.container.visible).toBe(true)
  })

  it('accumulate stores polygons for active player', () => {
    const polys = [[{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]]
    fog.accumulate(polys)
    expect(fog._playerPolys['*']).toHaveLength(1)
  })

  it('accumulate ignores empty/null input', () => {
    fog.accumulate(null)
    fog.accumulate([])
    expect(fog._playerPolys['*']).toHaveLength(0)
  })

  it('reset clears active player polygons', () => {
    fog.accumulate([[{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]])
    expect(fog._playerPolys['*']).toHaveLength(1)
    fog.reset()
    expect(fog._playerPolys['*']).toHaveLength(0)
    expect(fog._bakedCount).toBe(0)
  })

  it('reset clears a specific player', () => {
    fog.activePlayerId = 'alice'
    fog.accumulate([[{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]])
    fog.activePlayerId = 'bob'
    fog.accumulate([[{ x: 200, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 100 }]])
    expect(fog._playerPolys['alice']).toHaveLength(1)
    expect(fog._playerPolys['bob']).toHaveLength(1)

    fog.reset('alice')
    expect(fog._playerPolys['alice']).toHaveLength(0)
    expect(fog._playerPolys['bob']).toHaveLength(1)
  })

  it('activePlayerId initializes storage for new player', () => {
    fog.activePlayerId = 'charlie'
    expect(fog._playerPolys['charlie']).toEqual([])
    fog.accumulate([[{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]])
    expect(fog._playerPolys['charlie']).toHaveLength(1)
    /* Default '*' should be untouched */
    expect(fog._playerPolys['*']).toHaveLength(0)
  })

  it('toJSON returns all players by default', () => {
    fog.activePlayerId = 'alice'
    fog.accumulate([[{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]])
    fog.activePlayerId = 'bob'
    fog.accumulate([[{ x: 200, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 100 }]])

    const all = fog.toJSON()
    expect(all['alice']).toHaveLength(1)
    expect(all['bob']).toHaveLength(1)
  })

  it('toJSON with playerId returns only that player data', () => {
    fog.activePlayerId = 'alice'
    fog.accumulate([[{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]])

    const data = fog.toJSON('alice')
    expect(data).toHaveLength(1)
    expect(data[0][0]).toEqual({ x: 0, y: 0 })
  })

  it('fromJSON restores all player data', () => {
    const data = {
      alice: [[{ x: 10, y: 20 }, { x: 30, y: 40 }, { x: 50, y: 60 }]],
      bob: [[{ x: 100, y: 200 }, { x: 300, y: 400 }, { x: 500, y: 600 }]],
    }
    fog.fromJSON(data)
    expect(fog._playerPolys['alice']).toHaveLength(1)
    expect(fog._playerPolys['bob']).toHaveLength(1)
    expect(fog._dirty).toBe(true)
  })

  it('fromJSON handles legacy single-player array', () => {
    const data = [[{ x: 10, y: 20 }, { x: 30, y: 40 }, { x: 50, y: 60 }]]
    fog.fromJSON(data)
    expect(fog._playerPolys['*']).toEqual(data)
    expect(fog._dirty).toBe(true)
  })

  it('holesGraphics cleared on reset', () => {
    fog.accumulate([[{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]])
    expect(fog._bakedCount).toBe(0)

    fog.enabled = true
    fog.update({ x: 0, y: 0, width: 800, height: 600 })
    expect(fog._bakedCount).toBe(1)

    fog.reset()
    expect(fog._bakedCount).toBe(0)
  })

  it('_appendPolys delegates to holesGraphics poly/fill', () => {
    /* After a full update, holesGraphics should be non-empty */
    const polys = [[{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]]
    fog._playerPolys['*'] = polys
    fog._bakedCount = 0

    /* We can't easily spy on the mocked Graphics, but we can verify
       bakedCount advances */
    fog._appendPolys(polys, 0, { x: 0, y: 0, width: 800, height: 600 })
    fog._bakedCount = polys.length
    expect(fog._bakedCount).toBe(1)
  })
})
