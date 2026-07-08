/**
 * DistanceRules — pluggable distance strategies for grid-aware measurement.
 *
 * Each rule is a function: (x1, y1, x2, y2, gridSize, gridType) => number
 * returning the distance in **movement units** (cells / hexes).
 *
 * To add a new rule:
 *   1. Write a function matching the signature above.
 *   2. Register it with `registerRule(name, fn)`.
 *   3. Select it via `getRule(name)` or `setActive(name)`.
 *
 * Default: 'chebyshev' for square grids (every diagonal = 1),
 *          'euclidean' for gridless, 'hex' for hex grids.
 */

const _registry = new Map()

/* ── Rules ─────────────────────────────────────────────────────── */

/**
 * Euclidean (straight-line) distance.
 * Returns raw world-units distance; caller divides by gridSize for cells.
 * Default for gridless — all real diagonal costs count.
 */
function euclidean(x1, y1, x2, y2, gridSize, gridType) {
  const dx = x2 - x1, dy = y2 - y1
  return Math.hypot(dx, dy)
}

/**
 * Chebyshev distance — every diagonal costs 1.
 * Common default for tactical grids (e.g. D&D 5e "1 square = 5 ft").
 * dx = |x1-x2|, dy = |y1-y2|, result = max(dx, dy) in cells.
 */
function chebyshev(x1, y1, x2, y2, gridSize) {
  const dcx = Math.abs(x2 - x1) / gridSize
  const dcy = Math.abs(y2 - y1) / gridSize
  return Math.max(dcx, dcy)
}

/**
 * Alternating diagonal — first diagonal counts as 1, second as 2.
 * (D&D 3.5e / PF1e pattern: 1-2-1-2)
 */
function alternating(x1, y1, x2, y2, gridSize) {
  const dcx = Math.abs(x2 - x1) / gridSize
  const dcy = Math.abs(y2 - y1) / gridSize
  const straight = Math.abs(dcx - dcy)
  const diag = Math.min(dcx, dcy)
  /* Every 2 diagonals = (1+2) = 3 cells, remainder alternates */
  const diagCost = Math.floor(diag / 2) * 3 + (diag % 2) * 1
  return straight + diagCost
}

/**
 * Hex distance — number of hexes between two hex-grid points.
 * Uses axial coordinate conversion from pixel positions.
 */
function hex(x1, y1, x2, y2, gridSize) {
  const r = gridSize / Math.sqrt(3)
  const w = r * Math.sqrt(3)
  const h = gridSize

  const row1 = Math.round(y1 / (h * 0.75))
  const off1 = (row1 % 2 === 0) ? 0 : w * 0.5
  const col1 = Math.round((x1 - off1) / w)

  const row2 = Math.round(y2 / (h * 0.75))
  const off2 = (row2 % 2 === 0) ? 0 : w * 0.5
  const col2 = Math.round((x2 - off2) / w)

  /* Cube coordinate conversion for flat-top hexes */
  const cx1 = col1 - Math.floor(row1 / 2)
  const cz1 = row1
  const cy1 = -cx1 - cz1

  const cx2 = col2 - Math.floor(row2 / 2)
  const cz2 = row2
  const cy2 = -cx2 - cz2

  return (Math.abs(cx1 - cx2) + Math.abs(cy1 - cy2) + Math.abs(cz1 - cz2)) / 2
}

/* ── Registry ──────────────────────────────────────────────────── */

function registerRule(name, fn) {
  _registry.set(name, fn)
}

function getRule(name) {
  return _registry.get(name)
}

function listRules() {
  return Array.from(_registry.keys())
}

/* Register built-in rules */
registerRule('euclidean', euclidean)
registerRule('chebyshev', chebyshev)
registerRule('alternating', alternating)
registerRule('hex', hex)

/* ── Active rule + auto-select ─────────────────────────────────── */

let _active = 'chebyshev'

function setActive(name) {
  if (!_registry.has(name)) throw new Error(`Unknown distance rule: ${name}`)
  _active = name
}

function getActive() {
  return _active
}

/**
 * Compute distance between two world-coordinate points using the
 * active rule. Returns distance in **world units** for euclidean,
 * or **grid cells** for grid-based rules.
 *
 * For gridless grids use 'euclidean'; otherwise the active rule is applied.
 */
function measure(x1, y1, x2, y2, gridSize = 100, gridType = 'square') {
  const fn = _registry.get(_active)
  if (!fn) return 0

  if (gridType === 'none') {
    return euclidean(x1, y1, x2, y2) / gridSize
  }
  return fn(x1, y1, x2, y2, gridSize, gridType)
}

export {
  registerRule,
  getRule,
  listRules,
  setActive,
  getActive,
  measure,
  /* Export individual rules for direct use in tests */
  euclidean,
  chebyshev,
  alternating,
  hex,
}
