/**
 * CellCoverage — compute which grid cells a template covers.
 *
 * Targeting seam (Stage 5):
 *   `getCoveredCells(template, gridType, gridSize)` returns an array of
 *   `{ gx, gy, cx, cy }` objects identifying each covered grid cell by
 *   its grid coordinates and world-center position. A future targeting
 *   system can call this method and then test tokens (by center point)
 *   against the returned cells:
 *
 *     const cells = getCoveredCells(template, 'square', 100)
 *     const inside = tokens.filter(t =>
 *       cells.some(c => Math.abs(t.x - c.cx) < 50 && Math.abs(t.y - c.cy) < 50)
 *     )
 *
 *   For gridless (gridType='none'), returns the template's boundary
 *   polygon vertices instead of grid cells — targeting would use
 *   point-in-polygon instead.
 *
 * Coverage is approximate but conservative: a cell is included if its
 * center falls within the template shape. This matches VTT conventions
 * and is sufficient for targeting.
 */

/**
 * Get grid cells covered by a template.
 * @param {import('./Template.js').Template} template
 * @param {string} gridType  'square', 'hex', or 'none'
 * @param {number} gridSize  pixel size of one grid cell
 * @returns {{ gx: number, gy: number, cx: number, cy: number }[] | {x:number,y:number}[]}
 */
export function getCoveredCells(template, gridType, gridSize) {
  if (gridType === 'none') {
    return getBoundaryPolygon(template)
  }
  if (gridType === 'hex') {
    return getHexCoverage(template, gridSize)
  }
  return getSquareCoverage(template, gridSize)
}

/**
 * Get boundary polygon vertices for gridless mode.
 * Returns the shape as a polygon for point-in-polygon testing.
 */
function getBoundaryPolygon(template) {
  const pts = []
  const { x, y, rotation } = template
  const EPS = 0.01

  switch (template.type) {
    case 'circle': {
      /* Approximate circle with 32-gon */
      const steps = 32
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2
        pts.push({ x: x + Math.cos(a) * template.radius, y: y + Math.sin(a) * template.radius })
      }
      return pts
    }
    case 'cone': {
      const halfAngle = template.angle / 2
      pts.push({ x, y })
      const steps = 16
      for (let i = 0; i <= steps; i++) {
        const a = rotation - halfAngle + (i / steps) * template.angle
        pts.push({ x: x + Math.cos(a) * template.length, y: y + Math.sin(a) * template.length })
      }
      return pts
    }
    case 'line': {
      const perpX = Math.cos(rotation + Math.PI / 2) * template.width / 2
      const perpY = Math.sin(rotation + Math.PI / 2) * template.width / 2
      const dirX = Math.cos(rotation) * template.length
      const dirY = Math.sin(rotation) * template.length
      return [
        { x: x + perpX, y: y + perpY },
        { x: x + dirX + perpX, y: y + dirY + perpY },
        { x: x + dirX - perpX, y: y + dirY - perpY },
        { x: x - perpX, y: y - perpY },
      ]
    }
    case 'rectangle': {
      const hw = template.width / 2, hh = template.height / 2
      const cosR = Math.cos(rotation), sinR = Math.sin(rotation)
      const corners = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]
      for (const [lx, ly] of corners) {
        pts.push({
          x: x + lx * cosR - ly * sinR,
          y: y + lx * sinR + ly * cosR,
        })
      }
      return pts
    }
  }
  return pts
}

/**
 * Square-grid coverage: axis-aligned bounding box iteration,
 * test each cell center against shape.
 */
function getSquareCoverage(template, gridSize) {
  const cells = []
  const bounds = getBounds(template)

  const gxMin = Math.floor(bounds.xMin / gridSize)
  const gyMin = Math.floor(bounds.yMin / gridSize)
  const gxMax = Math.ceil(bounds.xMax / gridSize)
  const gyMax = Math.ceil(bounds.yMax / gridSize)

  for (let gy = gyMin; gy < gyMax; gy++) {
    for (let gx = gxMin; gx < gxMax; gx++) {
      const cx = gx * gridSize + gridSize / 2
      const cy = gy * gridSize + gridSize / 2
      if (testPointInShape(template, cx, cy)) {
        cells.push({ gx, gy, cx, cy })
      }
    }
  }
  return cells
}

/**
 * Basic hex coverage: approximate with bounding-box iteration,
 * test each hex center.
 */
function getHexCoverage(template, gridSize) {
  const cells = []
  const bounds = getBounds(template)
  const r = gridSize / Math.sqrt(3)
  const w = r * Math.sqrt(3)
  const h = gridSize

  const rowMin = Math.floor(bounds.yMin / (h * 0.75)) - 1
  const rowMax = Math.ceil(bounds.yMax / (h * 0.75)) + 1
  const colMin = Math.floor(bounds.xMin / w) - 1
  const colMax = Math.ceil(bounds.xMax / w) + 1

  for (let row = rowMin; row <= rowMax; row++) {
    const offsetX = (row % 2 === 0) ? 0 : w * 0.5
    for (let col = colMin; col <= colMax; col++) {
      const cx = col * w + offsetX
      const cy = row * h * 0.75
      if (testPointInShape(template, cx, cy)) {
        cells.push({ gx: col, gy: row, cx, cy })
      }
    }
  }
  return cells
}

/* ── Bounding box ──────────────────────────────────────────────── */

function getBounds(template) {
  const { x, y, rotation } = template
  let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity

  function expand(px, py) {
    if (px < xMin) xMin = px
    if (py < yMin) yMin = py
    if (px > xMax) xMax = px
    if (py > yMax) yMax = py
  }

  switch (template.type) {
    case 'circle': {
      expand(x - template.radius, y - template.radius)
      expand(x + template.radius, y + template.radius)
      break
    }
    case 'cone': {
      expand(x, y)
      const halfAngle = template.angle / 2
      const steps = 16
      for (let i = 0; i <= steps; i++) {
        const a = rotation - halfAngle + (i / steps) * template.angle
        expand(x + Math.cos(a) * template.length, y + Math.sin(a) * template.length)
      }
      break
    }
    case 'line': {
      const perpX = Math.cos(rotation + Math.PI / 2) * template.width / 2
      const perpY = Math.sin(rotation + Math.PI / 2) * template.width / 2
      const dirX = Math.cos(rotation) * template.length
      const dirY = Math.sin(rotation) * template.length
      expand(x + perpX, y + perpY)
      expand(x + dirX + perpX, y + dirY + perpY)
      expand(x + dirX - perpX, y + dirY - perpY)
      expand(x - perpX, y - perpY)
      break
    }
    case 'rectangle': {
      const hw = template.width / 2, hh = template.height / 2
      const cosR = Math.cos(rotation), sinR = Math.sin(rotation)
      for (const [lx, ly] of [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]) {
        expand(x + lx * cosR - ly * sinR, y + lx * sinR + ly * cosR)
      }
      break
    }
  }

  return { xMin, yMin, xMax, yMax }
}

/* ── Point-in-shape tests ──────────────────────────────────────── */

function testPointInShape(template, px, py) {
  const dx = px - template.x
  const dy = py - template.y
  const dist = Math.hypot(dx, dy)

  switch (template.type) {
    case 'circle':
      return dist <= template.radius

    case 'cone': {
      if (dist > template.length) return false
      const angleToPoint = Math.atan2(dy, dx)
      const halfAngle = template.angle / 2
      let diff = angleToPoint - template.rotation
      /* Normalize to [-PI, PI] */
      while (diff > Math.PI) diff -= Math.PI * 2
      while (diff < -Math.PI) diff += Math.PI * 2
      return Math.abs(diff) <= halfAngle + 0.001
    }

    case 'line': {
      /* Project point onto the line direction */
      const dirX = Math.cos(template.rotation)
      const dirY = Math.sin(template.rotation)
      const t = dx * dirX + dy * dirY
      if (t < 0 || t > template.length) return false
      /* Perpendicular distance */
      const perpDist = Math.abs(-dirY * dx + dirX * dy)
      return perpDist <= template.width / 2 + 0.001
    }

    case 'rectangle': {
      /* Rotate point into local space */
      const cosR = Math.cos(-template.rotation)
      const sinR = Math.sin(-template.rotation)
      const lx = dx * cosR - dy * sinR
      const ly = dx * sinR + dy * cosR
      return Math.abs(lx) <= template.width / 2 + 0.001 &&
             Math.abs(ly) <= template.height / 2 + 0.001
    }
  }
  return false
}

export {
  getBoundaryPolygon,
  testPointInShape,
  getBounds,
}
