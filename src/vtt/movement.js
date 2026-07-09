/**
 * movement.js — tactical grid movement.
 *
 * Computes the reachable area for a token as a Dijkstra flood over grid
 * cells, with:
 *   - D&D 5-10-5 diagonals: 1st diagonal costs 1 cell, 2nd costs 2,
 *     alternating (tracked per-path via a parity bit in the search state)
 *   - wall blocking: a step is illegal if the segment between the two
 *     cell centers crosses a movement-blocking wall
 *   - open doors passable, closed doors blocking
 *
 * Everything is pure; the MovementLayer renders the result and
 * GameActions consumes paths for snapped movement.
 */

export function wallBlocksMovement(wall) {
  if (wall.type === 'door') return wall.doorState !== 'open'
  /* solid, secret and see-through (windows) block movement; terrain
     walls are difficult ground, not barriers. */
  return wall.type === 'solid' || wall.type === 'secret' || wall.type === 'see-through'
}

/** Proper segment intersection (excluding collinear touch at endpoints). */
export function segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
  const d1 = cross(cx, cy, dx, dy, ax, ay)
  const d2 = cross(cx, cy, dx, dy, bx, by)
  const d3 = cross(ax, ay, bx, by, cx, cy)
  const d4 = cross(ax, ay, bx, by, dx, dy)
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true
  if (d1 === 0 && onSegment(cx, cy, dx, dy, ax, ay)) return true
  if (d2 === 0 && onSegment(cx, cy, dx, dy, bx, by)) return true
  if (d3 === 0 && onSegment(ax, ay, bx, by, cx, cy)) return true
  if (d4 === 0 && onSegment(ax, ay, bx, by, dx, dy)) return true
  return false
}

function cross(ax, ay, bx, by, px, py) {
  return (bx - ax) * (py - ay) - (by - ay) * (px - ax)
}

function onSegment(ax, ay, bx, by, px, py) {
  return Math.min(ax, bx) <= px && px <= Math.max(ax, bx) &&
         Math.min(ay, by) <= py && py <= Math.max(ay, by)
}

const DIRS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],          // orthogonal
  [1, 1], [1, -1], [-1, 1], [-1, -1],        // diagonal
]

/**
 * Dijkstra flood from the token's cell.
 *
 * @param {object} opts
 *   token      — needs x, y, width, height (pixels)
 *   walls      — Wall[] for the scene
 *   gridSize   — pixels per cell
 *   gridUnit   — feet per cell (e.g. 5)
 *   speed      — movement budget in feet (e.g. 30)
 *   bounds     — { width, height } scene pixel bounds
 * @returns {{ origin, cells: Map<key,{cx,cy,costFt}>, cameFrom: Map<key,key> }}
 *   key is `${cx},${cy}`. `cells` excludes the origin cell.
 */
export function computeReachable({ token, walls, gridSize, gridUnit = 5, speed = 30, bounds }) {
  const blocking = (walls ?? []).filter(wallBlocksMovement)
  const ox = Math.floor((token.x + token.width / 2) / gridSize)
  const oy = Math.floor((token.y + token.height / 2) / gridSize)
  const budgetCells = Math.floor(speed / gridUnit)
  const maxCx = bounds ? Math.floor(bounds.width / gridSize) - 1 : Infinity
  const maxCy = bounds ? Math.floor(bounds.height / gridSize) - 1 : Infinity

  const center = (c) => c * gridSize + gridSize / 2

  function stepBlocked(cx1, cy1, cx2, cy2) {
    const x1 = center(cx1), y1 = center(cy1)
    const x2 = center(cx2), y2 = center(cy2)
    for (const w of blocking) {
      if (segmentsIntersect(x1, y1, x2, y2, w.x, w.y, w.x2, w.y2)) return true
    }
    /* Diagonal corner-cutting: both adjacent orthogonal steps must also
       be clear, or the token squeezes through a wall corner. */
    if (cx1 !== cx2 && cy1 !== cy2) {
      for (const w of blocking) {
        if (segmentsIntersect(x1, y1, x2, y1, w.x, w.y, w.x2, w.y2)) return true
        if (segmentsIntersect(x1, y1, x1, y2, w.x, w.y, w.x2, w.y2)) return true
      }
    }
    return false
  }

  /* State: cell + diagonal parity (5-10-5). Best cost per (cell,parity). */
  const best = new Map()          // "cx,cy,p" -> cells spent
  const bestCell = new Map()      // "cx,cy"   -> cells spent (min over parity)
  const cameFrom = new Map()      // "cx,cy"   -> "cx,cy" predecessor of best path
  const startKey = `${ox},${oy}`
  const queue = [{ cx: ox, cy: oy, cost: 0, parity: 0 }]
  best.set(`${ox},${oy},0`, 0)
  bestCell.set(startKey, 0)

  while (queue.length) {
    /* Small frontier — linear extract-min is fine at speed<=12 cells. */
    let mi = 0
    for (let i = 1; i < queue.length; i++) if (queue[i].cost < queue[mi].cost) mi = i
    const cur = queue.splice(mi, 1)[0]

    for (const [dx, dy] of DIRS) {
      const nx = cur.cx + dx, ny = cur.cy + dy
      if (nx < 0 || ny < 0 || nx > maxCx || ny > maxCy) continue
      const diagonal = dx !== 0 && dy !== 0
      const stepCost = diagonal ? (cur.parity === 0 ? 1 : 2) : 1
      const nCost = cur.cost + stepCost
      if (nCost > budgetCells) continue
      if (stepBlocked(cur.cx, cur.cy, nx, ny)) continue
      const nParity = diagonal ? (cur.parity ^ 1) : cur.parity
      const sKey = `${nx},${ny},${nParity}`
      if ((best.get(sKey) ?? Infinity) <= nCost) continue
      best.set(sKey, nCost)
      const cKey = `${nx},${ny}`
      if (nCost < (bestCell.get(cKey) ?? Infinity)) {
        bestCell.set(cKey, nCost)
        cameFrom.set(cKey, `${cur.cx},${cur.cy}`)
      }
      queue.push({ cx: nx, cy: ny, cost: nCost, parity: nParity })
    }
  }

  const cells = new Map()
  for (const [key, cost] of bestCell) {
    if (key === startKey) continue
    const [cx, cy] = key.split(',').map(Number)
    cells.set(key, { cx, cy, costFt: cost * gridUnit })
  }
  return { origin: { cx: ox, cy: oy }, cells, cameFrom }
}

/** Reconstruct the best path to a reachable cell. Returns null if unreachable. */
export function pathTo(reachable, cx, cy) {
  const key = `${cx},${cy}`
  if (!reachable.cells.has(key)) return null
  const path = []
  let cur = key
  const originKey = `${reachable.origin.cx},${reachable.origin.cy}`
  while (cur && cur !== originKey) {
    const [x, y] = cur.split(',').map(Number)
    path.unshift({ cx: x, cy: y })
    cur = reachable.cameFrom.get(cur)
  }
  path.unshift({ ...reachable.origin })
  return { path, costFt: reachable.cells.get(key).costFt }
}

/** Snap a pixel position to the cell whose center is nearest. */
export function snapToCell(x, y, w, h, gridSize) {
  const cx = Math.floor((x + w / 2) / gridSize)
  const cy = Math.floor((y + h / 2) / gridSize)
  return {
    x: cx * gridSize + (gridSize - w) / 2,
    y: cy * gridSize + (gridSize - h) / 2,
    cx, cy,
  }
}
