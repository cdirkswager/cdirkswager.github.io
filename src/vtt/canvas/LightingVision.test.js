import { describe, it, expect, beforeEach } from 'vitest'
import { Wall } from './Wall.js'
import { Token } from './Token.js'
import {
  wallBlocksVision,
  wallBlocksLight,
  WallSpatialIndex,
  rayIntersectSegment,
  computeVisionPolygon,
  computeLightPolygon,
  computeCombinedVision,
  polygonContainsPoint,
} from './LightingVision.js'

/* Helper: create a wall with minimal fields */
function w(x, y, x2, y2, type = 'solid', doorState = null, hidden = false) {
  return new Wall({ id: `w-${Math.random()}`, x, y, x2, y2, type, doorState, hidden })
}

function token(opts = {}) {
  return new Token({
    id: opts.id ?? `t-${Math.random()}`,
    name: opts.name ?? 'Test',
    x: opts.x ?? 0,
    y: opts.y ?? 0,
    width: opts.width ?? 40,
    height: opts.height ?? 40,
    visionEnabled: opts.visionEnabled ?? true,
    sightRange: opts.sightRange ?? 0,
    darkvisionRange: opts.darkvisionRange ?? 0,
    lightRadius: opts.lightRadius ?? 0,
    lightColor: opts.lightColor ?? 0xffeedd,
    lightIntensity: opts.lightIntensity ?? 1,
  })
}

/* ───── WallSpatialIndex ─────────────────────────────────────── */

describe('WallSpatialIndex', () => {
  let index

  beforeEach(() => {
    index = new WallSpatialIndex()
  })

  it('returns empty array from empty index', () => {
    const result = index.getWallsInRange(0, 0, 500)
    expect(result).toEqual([])
  })

  it('indexes a single wall and returns it in range', () => {
    const walls = [w(0, 0, 100, 0)]
    index.rebuildIfNeeded(walls)
    const result = index.getWallsInRange(50, 50, 200)
    expect(result).toHaveLength(1)
    expect(result[0]).toBe(walls[0])
  })

  it('does not return walls outside query range', () => {
    const walls = [w(1000, 1000, 1100, 1000)]
    index.rebuildIfNeeded(walls)
    const result = index.getWallsInRange(0, 0, 200)
    expect(result).toHaveLength(0)
  })

  it('rebuilds when walls array changes', () => {
    const wallsA = [w(0, 0, 100, 0)]
    index.rebuildIfNeeded(wallsA)
    expect(index.getWallsInRange(50, 50, 200)).toHaveLength(1)

    index.invalidate()
    const wallsB = [w(2000, 2000, 2100, 2000)]
    index.rebuildIfNeeded(wallsB)
    const inRangeB = index.getWallsInRange(2050, 2050, 200)
    expect(inRangeB).toHaveLength(1)
  })

  it('skips pass-through walls (open door, see-through)', () => {
    const walls = [
      w(0, 0, 100, 0, 'door', 'open'),
      w(0, 100, 100, 100, 'see-through'),
    ]
    index.rebuildIfNeeded(walls)
    const result = index.getWallsInRange(50, 50, 200)
    expect(result).toHaveLength(0)
  })

  it('includes blocking walls (solid, closed door, secret, terrain)', () => {
    const walls = [
      w(0, 0, 100, 0, 'solid'),
      w(0, 100, 100, 100, 'door', 'closed'),
      w(0, 200, 100, 200, 'secret', null, true),
      w(0, 300, 100, 300, 'terrain'),
    ]
    index.rebuildIfNeeded(walls)
    const result = index.getWallsInRange(50, 50, 500)
    expect(result).toHaveLength(4)
  })
})

/* ───── rayIntersectSegment ──────────────────────────────────── */

describe('rayIntersectSegment', () => {
  it('ray hits segment', () => {
    const hit = rayIntersectSegment(0, 0, 100, 0, 50, -50, 50, 50)
    expect(hit).not.toBeNull()
    expect(hit.t).toBeCloseTo(0.5, 5)
  })

  it('ray misses segment', () => {
    const hit = rayIntersectSegment(0, 0, 100, 0, 50, 50, 50, 100)
    expect(hit).toBeNull()
  })

  it('parallel ray returns null', () => {
    const hit = rayIntersectSegment(0, 0, 100, 0, 0, 50, 100, 50)
    expect(hit).toBeNull()
  })

  it('hit at segment endpoint', () => {
    const hit = rayIntersectSegment(0, 0, 100, 100, 50, 50, 100, 50)
    expect(hit).not.toBeNull()
    expect(hit.u).toBeCloseTo(0, 5)
    expect(hit.x).toBe(50)
    expect(hit.y).toBe(50)
  })

  it('ray behind origin (t < 0) returns null', () => {
    const hit = rayIntersectSegment(0, 0, 100, 0, -50, -25, -50, 25)
    expect(hit).toBeNull()
  })
})

/* ───── polygonContainsPoint ──────────────────────────────────── */

describe('polygonContainsPoint', () => {
  const poly = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ]

  it('point inside', () => {
    expect(polygonContainsPoint(poly, 50, 50)).toBe(true)
  })

  it('point outside', () => {
    expect(polygonContainsPoint(poly, 200, 200)).toBe(false)
  })

  it('point on edge', () => {
    expect(polygonContainsPoint(poly, 50, 0)).toBe(true)
  })

  it('null polygon returns false', () => {
    expect(polygonContainsPoint(null, 0, 0)).toBe(false)
  })

  it('triangle with point inside', () => {
    const tri = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 100 }]
    expect(polygonContainsPoint(tri, 50, 50)).toBe(true)
    expect(polygonContainsPoint(tri, 0, 50)).toBe(false)
  })
})

/* ───── wallBlocksVision / wallBlocksLight ────────────────────── */

describe('wall block rules', () => {
  it('wallBlocksVision: solid blocks', () => {
    expect(wallBlocksVision(w(0, 0, 1, 1, 'solid'))).toBe(true)
  })
  it('wallBlocksVision: closed door blocks', () => {
    expect(wallBlocksVision(w(0, 0, 1, 1, 'door', 'closed'))).toBe(true)
  })
  it('wallBlocksVision: open door passes', () => {
    expect(wallBlocksVision(w(0, 0, 1, 1, 'door', 'open'))).toBe(false)
  })
  it('wallBlocksVision: hidden secret blocks', () => {
    expect(wallBlocksVision(w(0, 0, 1, 1, 'secret', null, true))).toBe(true)
  })
  it('wallBlocksVision: visible secret passes', () => {
    expect(wallBlocksVision(w(0, 0, 1, 1, 'secret', null, false))).toBe(false)
  })
  it('wallBlocksVision: see-through passes', () => {
    expect(wallBlocksVision(w(0, 0, 1, 1, 'see-through'))).toBe(false)
  })
  it('wallBlocksVision: terrain blocks', () => {
    expect(wallBlocksVision(w(0, 0, 1, 1, 'terrain'))).toBe(true)
  })

  it('wallBlocksLight: open door passes', () => {
    expect(wallBlocksLight(w(0, 0, 1, 1, 'door', 'open'))).toBe(false)
  })
  it('wallBlocksLight: terrain passes (light goes through)', () => {
    expect(wallBlocksLight(w(0, 0, 1, 1, 'terrain'))).toBe(false)
  })
  it('wallBlocksLight: solid still blocks light', () => {
    expect(wallBlocksLight(w(0, 0, 1, 1, 'solid'))).toBe(true)
  })
})

/* ───── computeVisionPolygon ──────────────────────────────────── */

describe('computeVisionPolygon', () => {
  it('returns polygon with no walls (open area)', () => {
    const poly = computeVisionPolygon(0, 0, 100, [])
    expect(poly).not.toBeNull()
    expect(poly.length).toBeGreaterThanOrEqual(3)
    /* All points should be within range */
    for (const p of poly) {
      const dist = Math.hypot(p.x, p.y)
      expect(dist).toBeLessThanOrEqual(101)
    }
  })

  it('returns null for zero range', () => {
    expect(computeVisionPolygon(0, 0, 0, [])).toBeNull()
  })

  it('vision stops at solid wall', () => {
    const walls = [w(80, -50, 80, 50)]
    const poly = computeVisionPolygon(0, 0, 200, walls)
    expect(poly).not.toBeNull()
    /* The wall at x=80 blocks rays aimed at angles between its endpoints.
       Compare the no-wall case: polygon should have some point near x=80
       (blocked by wall) vs all points at range 200 (no wall). */
    const noWall = computeVisionPolygon(0, 0, 200, [])
    expect(noWall).not.toBeNull()
    /* With wall, the polygon is smaller (at least one blocked vertex) */
    const blockedDist = Math.min(...poly.map(p => Math.hypot(p.x, p.y)))
    const openDist = Math.min(...noWall.map(p => Math.hypot(p.x, p.y)))
    expect(blockedDist).toBeLessThan(openDist)
  })
})

/* ───── computeLightPolygon ───────────────────────────────────── */

describe('computeLightPolygon', () => {
  it('returns polygon with no walls', () => {
    const poly = computeLightPolygon(0, 0, 100, [])
    expect(poly).not.toBeNull()
    expect(poly.length).toBeGreaterThanOrEqual(3)
  })

  it('light passes through terrain', () => {
    const walls = [w(50, -50, 50, 50, 'terrain')]
    const poly = computeLightPolygon(0, 0, 200, walls)
    expect(poly).not.toBeNull()
    /* Terrain does not block light, so some points should be well past x=50 */
    const pastTerrain = poly.filter(p => p.x > 100)
    expect(pastTerrain.length).toBeGreaterThan(0)
  })
})

/* ───── computeCombinedVision ─────────────────────────────────── */

describe('computeCombinedVision', () => {
  it('returns null when no viewpoint tokens match', () => {
    const tokens = [token({ id: 'a', sightRange: 200 })]
    const result = computeCombinedVision([], tokens, ['nonexistent'])
    expect(result).toBeNull()
  })

  it('returns vision polygon for a single viewpoint token', () => {
    const tokens = [token({ id: 't1', x: 0, y: 0, sightRange: 100 })]
    const result = computeCombinedVision([], tokens, 't1')
    expect(result).not.toBeNull()
    expect(result.visionPolygons).toHaveLength(1)
    expect(result.token).toBe(tokens[0])
    expect(result.tokenIds).toEqual(['t1'])
  })

  it('includes darkvision polygon when darkvisionRange differs', () => {
    const tokens = [token({ id: 't1', x: 0, y: 0, sightRange: 100, darkvisionRange: 200 })]
    const result = computeCombinedVision([], tokens, 't1')
    expect(result.visionPolygons).toHaveLength(2)
  })

  it('does not duplicate darkvision when range matches sightRange', () => {
    const tokens = [token({ id: 't1', x: 0, y: 0, sightRange: 100, darkvisionRange: 100 })]
    const result = computeCombinedVision([], tokens, 't1')
    expect(result.visionPolygons).toHaveLength(1)
  })

  it('includes light polygons from all tokens', () => {
    const tokens = [
      token({ id: 't1', x: 0, y: 0, sightRange: 100 }),
      token({ id: 't2', x: 200, y: 200, lightRadius: 150 }),
    ]
    const result = computeCombinedVision([], tokens, 't1')
    expect(result.lightPolygons).toHaveLength(1)
    expect(result.lightPolygons[0].radius).toBe(150)
  })

  it('unions vision from multiple viewpoint tokens', () => {
    const tokens = [
      token({ id: 't1', x: 0, y: 0, sightRange: 100 }),
      token({ id: 't2', x: 300, y: 300, sightRange: 100 }),
    ]
    const result = computeCombinedVision([], tokens, ['t1', 't2'])
    expect(result.visionPolygons).toHaveLength(2)
  })

  it('returns exactly the walls within range (no shadowing bug)', () => {
    const walls = [
      w(0, 0, 100, 0),       // 0 — at origin
      w(200, 0, 300, 0),     // 1 — 200 away
      w(500, 0, 600, 0),     // 2 — 500 away
      w(0, 500, 100, 500),   // 3 — 500 away
      w(1000, 0, 1100, 0),   // 4 — 1000 away
    ]
    const si = new WallSpatialIndex()
    si.rebuildIfNeeded(walls)

    /* Range 300 from (50, 50) should return walls 0, 1 (within 300), NOT 2, 3, 4 */
    const near = si.getWallsInRange(50, 50, 300)
    expect(near).toContain(walls[0])
    expect(near).toContain(walls[1])
    expect(near).not.toContain(walls[2])
    expect(near).not.toContain(walls[3])
    expect(near).not.toContain(walls[4])

    /* Range 600 from (0, 0) should return walls 0, 1, 2, 3, NOT 4 */
    const mid = si.getWallsInRange(0, 0, 600)
    expect(mid).toContain(walls[0])
    expect(mid).toContain(walls[1])
    expect(mid).toContain(walls[2])
    expect(mid).toContain(walls[3])
    expect(mid).not.toContain(walls[4])
  })

  it('returns walls near query center but not far diagonal cells', () => {
    /* Place walls in a ring pattern around origin */
    const walls = []
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2
      const r = 300
      walls.push(w(
        Math.cos(angle) * r,
        Math.sin(angle) * r,
        Math.cos(angle + 0.1) * r,
        Math.sin(angle + 0.1) * r,
      ))
    }
    /* Two walls very far away */
    walls.push(w(5000, 5000, 5100, 5000))
    walls.push(w(-5000, -5000, -4900, -5000))

    const si = new WallSpatialIndex()
    si.rebuildIfNeeded(walls)

    const result = si.getWallsInRange(0, 0, 400)
    /* Should find all 12 ring walls, NOT the far ones */
    expect(result.length).toBe(12)
  })

  it('passes ambientLight in result', () => {
    const tokens = [token({ id: 't1', sightRange: 100 })]
    const result = computeCombinedVision([], tokens, 't1', 0.5)
    expect(result.ambientLight).toBe(0.5)
  })

  it('getVisibleRegion returns first vision polygon', () => {
    const tokens = [token({ id: 't1', x: 0, y: 0, sightRange: 100 })]
    const result = computeCombinedVision([], tokens, 't1')
    expect(result.getVisibleRegion()).toBe(result.visionPolygons[0])
  })
})

/* ───── Spatial index integration ─────────────────────────────── */

describe('computeCombinedVision with spatial index', () => {
  it('produces same result as without spatial index (open area)', () => {
    const tokens = [token({ id: 't1', x: 0, y: 0, sightRange: 100 })]
    const walls = [w(1000, 1000, 1100, 1100, 'solid')]

    const withoutSI = computeCombinedVision(walls, tokens, 't1')
    const si = new WallSpatialIndex()
    si.rebuildIfNeeded(walls)
    const withSI = computeCombinedVision(walls, tokens, 't1', 0, si)

    expect(withSI.visionPolygons).toHaveLength(withoutSI.visionPolygons.length)
    expect(withSI.lightPolygons).toHaveLength(withoutSI.lightPolygons.length)
  })

  it('produces identical polygon area with spatial index in blocked scene', () => {
    /* A token in a room with walls nearby — SI must not miss blocking walls */
    const walls = [
      /* Room around (0, 0) */
      w(-100, -100, 100, -100, 'solid'),
      w(100, -100, 100, 100, 'solid'),
      w(100, 100, -100, 100, 'solid'),
      w(-100, 100, -100, -100, 'solid'),
    ]
    const tokens = [token({ id: 't1', x: 0, y: 0, sightRange: 500 })]

    const si = new WallSpatialIndex()
    si.rebuildIfNeeded(walls)

    /* Without SI — rays test ALL walls */
    const full = computeCombinedVision(walls, tokens, 't1')
    /* With SI — culled set must still include the room walls */
    const culled = computeCombinedVision(walls, tokens, 't1', 0, si)

    expect(culled).not.toBeNull()
    expect(full).not.toBeNull()

    const fullReg = full.visionPolygons[0]
    const cullReg = culled.visionPolygons[0]
    expect(cullReg).not.toBeNull()
    expect(fullReg).not.toBeNull()

    /* Both should be bounded by the room — max extent < 500 */
    const fullMax = Math.max(...fullReg.map(p => Math.hypot(p.x, p.y)))
    const cullMax = Math.max(...cullReg.map(p => Math.hypot(p.x, p.y)))
    expect(cullMax).toBeLessThan(200)
    expect(fullMax).toBeLessThan(200)

    /* Polygon vertex counts should match (same blocking walls found) */
    expect(cullReg.length).toBe(fullReg.length)
  })
})
