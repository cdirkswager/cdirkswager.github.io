/*
 * Lighting & Vision — core geometry engine.
 *
 * Compute what a point can see/illuminate against walls.
 *
 * ── Known limitation ─────────────────────────────────────────────
 * Client-side masking hides pixels, not data: a player's client still
 * receives the synced positions of tokens it is visually hiding.
 * This masking is a *visual* effect, not a security boundary against
 * a determined player inspecting their own client. True hidden-info
 * enforcement requires server-side visibility checks (not implemented).
 * ─────────────────────────────────────────────────────────────────
 */

const RAY_STEP = Math.PI / 180 // 1 degree
const MAX_VISION_RANGE = 5000
const MAX_LIGHT_RANGE = 3000
const NEAR_CLIP = 1

// Grid cell size for spatial index — tune based on typical sight range
const SPATIAL_CELL = 200

// ── Wall-type query helpers ──────────────────────────────────────

export function wallBlocksVision(wall) {
  if (wall.type === 'solid') return true
  if (wall.type === 'door') return wall.doorState === 'closed'
  if (wall.type === 'secret') return wall.hidden
  if (wall.type === 'terrain') return true
  return false
}

export function wallBlocksLight(wall) {
  if (wall.type === 'solid') return true
  if (wall.type === 'door') return wall.doorState === 'closed'
  if (wall.type === 'secret') return wall.hidden
  return false
}

// ── Spatial index over walls ─────────────────────────────────────
// Built once when walls change; queried per raycast to cull distant walls.

export class WallSpatialIndex {
  constructor() {
    this._grid = new Map()
    this._walls = []
    this._dirty = true
  }

  /** Mark the index as needing rebuild. Call after wall adds/removes/changes. */
  invalidate() { this._dirty = true }

  /** @returns {boolean} true if a rebuild was needed and performed. */
  rebuildIfNeeded(walls) {
    if (!this._dirty && this._walls === walls) return false
    this._build(walls)
    return true
  }

  _build(walls) {
    this._grid.clear()
    this._walls = walls
    const cell = SPATIAL_CELL

    for (let i = 0; i < walls.length; i++) {
      const w = walls[i]
      if (!wallBlocksVision(w) && !wallBlocksLight(w)) continue
      const minX = Math.min(w.x, w.x2)
      const maxX = Math.max(w.x, w.x2)
      const minY = Math.min(w.y, w.y2)
      const maxY = Math.max(w.y, w.y2)
      const cx1 = Math.floor(minX / cell)
      const cx2 = Math.floor(maxX / cell)
      const cy1 = Math.floor(minY / cell)
      const cy2 = Math.floor(maxY / cell)

      for (let cy = cy1; cy <= cy2; cy++) {
        for (let cx = cx1; cx <= cx2; cx++) {
          const key = `${cx},${cy}`
          let bucket = this._grid.get(key)
          if (!bucket) { bucket = []; this._grid.set(key, bucket) }
          bucket.push(i)
        }
      }
    }

    this._dirty = false
  }

  /** Return wall indices within `range` of `(cx, cy)`. */
  queryIndices(cx, cy, range) {
    const cell = SPATIAL_CELL
    const startCx = Math.floor((cx - range) / cell)
    const startCy = Math.floor((cy - range) / cell)
    const endCx = Math.floor((cx + range) / cell)
    const endCy = Math.floor((cy + range) / cell)
    const seen = new Set()
    const result = []

    for (let gy = startCy; gy <= endCy; gy++) {
      for (let gx = startCx; gx <= endCx; gx++) {
        const bucket = this._grid.get(`${gx},${gy}`)
        if (!bucket) continue
        for (const idx of bucket) {
          if (seen.has(idx)) continue
          seen.add(idx)
          const w = this._walls[idx]
          const dist = distToSegmentFast(cx, cy, w.x, w.y, w.x2, w.y2)
          if (dist <= range + SPATIAL_CELL) {
            result.push(idx)
          }
        }
      }
    }

    return result
  }

  getWallsInRange(cx, cy, range) {
    return this.queryIndices(cx, cy, range).map(i => this._walls[i])
  }
}

/* Fast point-to-segment distance for spatial index culling */
export function distToSegmentFast(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(px - ax, py - ay)
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/* Kept for backward compat with existing callers in queryIndices */
const _distToSegmentFast = (w, px, py) => distToSegmentFast(px, py, w.x, w.y, w.x2, w.y2)

// ── Ray intersection ─────────────────────────────────────────────

export function rayIntersectSegment(ox, oy, dx, dy, ax, ay, bx, by) {
  const s1x = dx - ox
  const s1y = dy - oy
  const s2x = bx - ax
  const s2y = by - ay
  const denom = s1x * s2y - s1y * s2x
  if (Math.abs(denom) < 1e-10) return null

  const t = ((ax - ox) * s2y - (ay - oy) * s2x) / denom
  const u = ((ax - ox) * s1y - (ay - oy) * s1x) / denom

  if (t >= 0 && u >= 0 && u <= 1) {
    return { x: ox + t * s1x, y: oy + t * s1y, t, u }
  }
  return null
}

function castRay(ox, oy, angle, range, walls, blockCheck) {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const ex = ox + cos * range
  const ey = oy + sin * range

  let closest = { x: ex, y: ey, t: range }
  let hitWall = null

  for (const wall of walls) {
    if (!blockCheck(wall)) continue
    const hit = rayIntersectSegment(ox, oy, ex, ey, wall.x, wall.y, wall.x2, wall.y2)
    if (hit && hit.t < closest.t && hit.t * range > NEAR_CLIP) {
      closest = hit
      hitWall = wall
    }
  }

  if (hitWall) {
    const epsilon = 0.5
    const cosPerp = -sin
    const sinPerp = cos
    closest.x += cosPerp * epsilon
    closest.y += sinPerp * epsilon
  }

  return closest
}

// ── Polygon computation helpers ──────────────────────────────────

function _buildAngleList(ox, oy, range, walls, blockCheck) {
  const wallAngles = new Set()
  const step = RAY_STEP

  for (const wall of walls) {
    if (!blockCheck(wall)) continue
    const dx = wall.x2 - wall.x
    const dy = wall.y2 - wall.y
    const segLen = Math.hypot(dx, dy)
    if (segLen < 1) continue
    for (const [px, py] of [[wall.x, wall.y], [wall.x2, wall.y2]]) {
      const a = Math.atan2(py - oy, px - ox)
      wallAngles.add(a)
    }
  }

  const angles = []
  for (let a = 0; a < Math.PI * 2; a += step) {
    angles.push(a)
  }
  for (const wa of wallAngles) {
    angles.push(wa - 0.001)
    angles.push(wa)
    angles.push(wa + 0.001)
  }
  angles.sort((a, b) => a - b)
  return angles
}

function _raycastPolygon(ox, oy, range, walls, blockCheck) {
  if (range <= 0) return null
  const effectiveRange = Math.min(range, MAX_VISION_RANGE)
  const angles = _buildAngleList(ox, oy, effectiveRange, walls, blockCheck)
  if (angles.length === 0) return null

  const points = new Array(angles.length)
  for (let i = 0; i < angles.length; i++) {
    const hit = castRay(ox, oy, angles[i], effectiveRange, walls, blockCheck)
    points[i] = { x: hit.x, y: hit.y }
  }
  return points
}

export function computeVisionPolygon(ox, oy, range, walls) {
  return _raycastPolygon(ox, oy, range, walls, wallBlocksVision)
}

export function computeLightPolygon(cx, cy, radius, walls) {
  return _raycastPolygon(cx, cy, radius, walls, wallBlocksLight)
}

// ── Perf timer (lightweight instrumentation) ─────────────────────
// Usage: const t = perfStart(); ... heavy work ...; perfEnd(t, 'label')

export function perfStart() {
  return performance.now()
}

export function perfEnd(start, label) {
  const elapsed = performance.now() - start
  if (typeof console !== 'undefined' && console.debug) {
    console.debug(`[Lighting] ${label}: ${elapsed.toFixed(2)}ms`)
  }
  return elapsed
}

// ── Combined vision for a player ─────────────────────────────────

/**
 * @param {Wall[]} walls  Full wall list
 * @param {Token[]} tokens  All scene tokens
 * @param {string|string[]} viewpointTokenIds  Which token(s) the current player sees through
 * @param {number} sceneAmbientLight  0-1
 * @param {WallSpatialIndex|null} [spatialIndex]  Optional spatial index for wall culling
 */
export function computeCombinedVision(walls, tokens, viewpointTokenIds, sceneAmbientLight = 0, spatialIndex = null) {
  const ids = Array.isArray(viewpointTokenIds) ? viewpointTokenIds : [viewpointTokenIds]
  const viewTokens = tokens.filter(t => ids.includes(t.id))
  if (viewTokens.length === 0) return null
  const token = viewTokens[0] // primary for center reference

  const results = {
    visionPolygons: [],
    lightPolygons: [],
    token,
    tokenIds: ids,
    ambientLight: sceneAmbientLight,
    /* Fog of War seam: getVisibleRegion() returns the union polygon
       for the current player's view. Fog of War subscribes to
       onVisionChanged to accumulate explored regions. */
    getVisibleRegion() {
      if (!this.visionPolygons?.length) return null
      return this.visionPolygons[0] // primary vision polygon
    },
  }

  for (const t of viewTokens) {
    const cx = t.centerX
    const cy = t.centerY
    const maxRange = Math.max(t.sightRange ?? 0, t.darkvisionRange ?? 0)
    const wallsInRange = spatialIndex
      ? spatialIndex.getWallsInRange(cx, cy, maxRange + SPATIAL_CELL)
      : walls

    if (t.visionEnabled && t.sightRange > 0) {
      const visionPoly = computeVisionPolygon(cx, cy, t.sightRange, wallsInRange)
      if (visionPoly) results.visionPolygons.push(visionPoly)
    }

    /* Darkvision: sees a set distance even in complete darkness.
       Walls still block darkvision. The darkvision polygon is added
       alongside normal vision; the renderer unions via ERASE blend. */
    if (t.visionEnabled && t.darkvisionRange > 0 && t.darkvisionRange !== (t.sightRange ?? 0)) {
      const darkWalls = spatialIndex
        ? spatialIndex.getWallsInRange(cx, cy, t.darkvisionRange + SPATIAL_CELL)
        : wallsInRange
      const darkPoly = computeVisionPolygon(cx, cy, t.darkvisionRange, darkWalls)
      if (darkPoly) results.visionPolygons.push(darkPoly)
    }
  }

  for (const t of tokens) {
    if (t.lightRadius > 0) {
      const cx = t.centerX
      const cy = t.centerY
      const lightWalls = spatialIndex
        ? spatialIndex.getWallsInRange(cx, cy, t.lightRadius + SPATIAL_CELL)
        : walls
      const poly = computeLightPolygon(cx, cy, t.lightRadius, lightWalls)
      if (poly) {
        results.lightPolygons.push({
          points: poly,
          cx, cy,
          radius: t.lightRadius,
          color: t.lightColor ?? 0xffeedd,
          intensity: t.lightIntensity ?? 1,
        })
      }
    }
  }

  return results
}

export function polygonContainsPoint(poly, px, py) {
  if (!poly || poly.length < 3) return false
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y
    const xj = poly[j].x, yj = poly[j].y
    if ((yi > py) !== (yj > py) &&
        px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}
