import { Graphics, Text, Container } from 'pixi.js'
import { computeReachable } from './movement.js'

/**
 * RenderSync — the projection from WorldStore to the Pixi canvas.
 *
 * The store is the truth; the canvas is a VIEW of the viewed scene.
 * This module is the only place world changes become pixels:
 *
 *   'world:effect'     → incremental sprite ops for the viewed scene
 *                        (effects for other scenes are correctly ignored —
 *                        the model was already updated by the store)
 *   'world:view-scene' → full re-projection (scene switch)
 *   'world:resynced'   → full re-projection (reconnect rehydration)
 *
 * It also owns the tactical presentation layer:
 *   - per-token HUD (nameplate, HP bar, active-turn ring) attached to the
 *     token's wrapper Container so it tracks drags for free
 *   - the movement-range overlay for the selected token
 */
export function createRenderSync({ world, canvas, eventBus }) {
  const { renderer, controller, sceneManager } = canvas
  const unsubs = []

  let selectedTokenId = null
  let turnTokenId = null
  let rangeGfx = null

  /* ── Per-token HUD ─────────────────────────────────────────────── */

  function tokenEntry(id) {
    return renderer.spriteMap.get(`token-${id}`) ?? null
  }

  function drawHud(token) {
    const entry = tokenEntry(token.id)
    if (!entry) return
    let hud = entry.hud
    if (!hud) {
      hud = new Container()
      hud.eventMode = 'none'
      entry.wrapper.addChild(hud)
      entry.hud = hud
    }
    hud.removeChildren()

    const w = token.width

    /* Turn ring (gold) or selection ring (cyan). */
    if (token.id === turnTokenId || token.id === selectedTokenId) {
      const ring = new Graphics()
      const color = token.id === turnTokenId ? 0xffc83d : 0x00d4ff
      ring.rect(-3, -3, w + 6, token.height + 6)
      ring.setStrokeStyle({ width: 3, color, alpha: 0.95 })
      ring.stroke()
      hud.addChild(ring)
    }

    /* Nameplate. */
    const name = new Text({
      text: token.name ?? '',
      style: { fontFamily: 'sans-serif', fontSize: 13, fill: 0xffffff,
               stroke: { color: 0x000000, width: 3 } },
    })
    name.anchor.set(0.5, 0)
    name.x = w / 2
    name.y = token.height + 4
    hud.addChild(name)

    /* HP bar — only when the token has been given hit points. */
    if (token.maxHp > 0) {
      const hp = Math.max(0, Math.min(token.hp ?? token.maxHp, token.maxHp))
      const pct = hp / token.maxHp
      const barW = w
      const bg = new Graphics()
      bg.rect(0, -10, barW, 6).fill({ color: 0x111111, alpha: 0.85 })
      const fillColor = pct > 0.5 ? 0x3ddc5a : pct > 0.25 ? 0xffc83d : 0xff4d4d
      bg.rect(1, -9, Math.max(0, (barW - 2) * pct), 4).fill({ color: fillColor })
      hud.addChild(bg)
    }
  }

  function redrawAllHuds() {
    const scene = world.viewedScene
    if (!scene) return
    for (const t of scene.tokens) drawHud(t)
  }

  /* ── Movement-range overlay ────────────────────────────────────── */

  function clearRange() {
    if (rangeGfx) { rangeGfx.destroy(); rangeGfx = null }
  }

  function drawRange() {
    clearRange()
    const scene = world.viewedScene
    if (!scene || !selectedTokenId) return
    const token = scene.getToken(selectedTokenId)
    if (!token) return
    const cells = computeReachable({
      token,
      walls: scene.walls,
      gridSize: scene.gridSize,
      gridUnit: scene.gridUnit || 5,
      speed: token.speed ?? 30,
      bounds: { cols: Math.ceil(scene.width / scene.gridSize), rows: Math.ceil(scene.height / scene.gridSize) },
    })
    if (!cells.length) return
    const g = new Graphics()
    g.eventMode = 'none'
    const gs = scene.gridSize
    for (const c of cells) {
      g.rect(c.col * gs + 1, c.row * gs + 1, gs - 2, gs - 2)
        .fill({ color: 0x2ea6ff, alpha: 0.18 })
    }
    /* Insert under the ruler so measurements stay readable. */
    renderer.gizmoContainer.addChildAt(g, 0)
    rangeGfx = g
  }

  /* ── Full projection (scene switch / resync) ───────────────────── */

  function project() {
    const scene = world.viewedScene
    if (!scene) return
    renderer.loadScene(scene)
    renderer.setLightingEnabled(scene.lightingEnabled)
    controller.ambientLight = scene.ambientLight ?? 0
    controller._spatialIndex.invalidate()
    controller.syncViewpointToOwnedTokens()
    controller.syncViewpointToAllVisionTokens()
    controller.invalidateLighting()
    clearRange()
    /* Token sprites are created async (texture load) — HUD after settle. */
    requestAnimationFrame(() => { redrawAllHuds(); drawRange() })
  }

  /* ── Incremental effects for the viewed scene ──────────────────── */

  function onEffect({ kind, action, id, sceneId, data }) {
    const viewed = world.viewedSceneId
    if (kind === 'combat') return   // handled via combat-changed below
    if (sceneId && sceneId !== viewed) return
    const scene = world.viewedScene
    if (!scene) return

    if (kind === 'token') {
      const token = scene.getToken(id)
      if (action === 'created' && token) {
        renderer.addToken(token)
        controller.invalidateLighting()
        controller.syncViewpointToOwnedTokens()
        controller.syncViewpointToAllVisionTokens()
        requestAnimationFrame(() => drawHud(token))
      } else if (action === 'updated' && token) {
        renderer.updateTokenPosition(id, token.x, token.y)
        if (data && ('userId' in data)) {
          controller.syncViewpointToOwnedTokens()
          controller.syncViewpointToAllVisionTokens()
        }
        controller.invalidateLighting()
        drawHud(token)
        if (id === selectedTokenId) drawRange()
      } else if (action === 'deleted') {
        renderer.removeToken(id)
        if (id === selectedTokenId) { selectedTokenId = null; clearRange() }
        controller.invalidateLighting()
        controller.syncViewpointToOwnedTokens()
        controller.syncViewpointToAllVisionTokens()
      }
      return
    }

    if (kind === 'wall') {
      renderer.redrawWalls()
      controller._spatialIndex.invalidate()
      controller.invalidateLighting()
      if (selectedTokenId) drawRange()
      return
    }

    if (kind === 'tile') {
      if (action === 'created') {
        const tile = scene.tiles.find(t => t.id === id)
        if (tile) renderer.addTile(tile)
      } else if (action === 'deleted') {
        renderer.removeTile(id)
      }
      return
    }

    if (kind === 'template') {
      renderer.templateLayer?.draw?.(scene.templates ?? [])
      return
    }

    if (kind === 'scene' && action === 'updated' && id === viewed && data) {
      if ('lightingEnabled' in data) {
        renderer.setLightingEnabled(scene.lightingEnabled)
        if (scene.lightingEnabled) controller.invalidateLighting()
      }
      if ('ambientLight' in data) {
        controller.ambientLight = scene.ambientLight ?? 0
        controller.invalidateLighting()
      }
      if ('gridUnit' in data || 'gridUnitLabel' in data || 'gridSize' in data) {
        renderer.rulerLayer?.setGrid(scene.gridSize, scene.gridType, scene.gridUnit, scene.gridUnitLabel)
        if (selectedTokenId) drawRange()
      }
    }
  }

  /* ── Selection / combat wiring ─────────────────────────────────── */

  function setSelected(tokenId) {
    const prev = selectedTokenId
    selectedTokenId = tokenId
    const scene = world.viewedScene
    if (scene) {
      const prevTok = prev && scene.getToken(prev)
      if (prevTok) drawHud(prevTok)
      const tok = tokenId && scene.getToken(tokenId)
      if (tok) drawHud(tok)
    }
    drawRange()
  }

  function setTurnToken(tokenId) {
    const prev = turnTokenId
    turnTokenId = tokenId
    const scene = world.viewedScene
    if (!scene) return
    const prevTok = prev && scene.getToken(prev)
    if (prevTok) drawHud(prevTok)
    const tok = tokenId && scene.getToken(tokenId)
    if (tok) drawHud(tok)
  }

  unsubs.push(eventBus.on('world:effect', onEffect))
  unsubs.push(eventBus.on('world:view-scene', project))
  unsubs.push(eventBus.on('world:resynced', project))
  unsubs.push(eventBus.on('token-selected', ({ tokenId }) => setSelected(tokenId)))
  unsubs.push(eventBus.on('combat-changed', (combat) => {
    const active = combat?.combatants?.length
      ? combat.combatants[combat.turnIndex % combat.combatants.length]
      : null
    setTurnToken(active?.tokenId ?? null)
  }))

  /* First paint. */
  project()

  return {
    destroy() {
      clearRange()
      for (const u of unsubs) u()
    },
  }
}
