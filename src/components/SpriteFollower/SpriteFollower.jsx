import { useEffect, useRef, useState } from 'react'
import './SpriteFollower.css'

/* ------------------------------------------------------------------ *
 * Directional sprite mapping (unchanged)
 * ------------------------------------------------------------------ */
const DIR_MAP = {
  N:  { src: '/Sprite/Fiix_North.png',     anim: '/Sprite/Animations/Fiix/Fiix_RunAnim_North.gif',     mirrorSrc: false, mirrorAnim: false },
  NE: { src: '/Sprite/Fiix_NorthEast.png', anim: '/Sprite/Animations/Fiix/Fiix_RunAnim_NorthWest.gif', mirrorSrc: false, mirrorAnim: true  },
  E:  { src: '/Sprite/Fiix_East.png',      anim: '/Sprite/Animations/Fiix/Fiix_RunAnim_East.gif',      mirrorSrc: false, mirrorAnim: false },
  SE: { src: '/Sprite/Fiix_SouthEast.png', anim: '/Sprite/Animations/Fiix/Fiix_RunAnim_SouthEast.gif', mirrorSrc: false, mirrorAnim: false },
  S:  { src: '/Sprite/Fiix_South.png',     anim: '/Sprite/Animations/Fiix/Fiix_RunAnim_South.gif',     mirrorSrc: false, mirrorAnim: false },
  SW: { src: '/Sprite/Fiix_SouthEast.png', anim: '/Sprite/Animations/Fiix/Fiix_RunAnim_SouthEast.gif', mirrorSrc: true,  mirrorAnim: true  },
  W:  { src: '/Sprite/Fiix_East.png',      anim: '/Sprite/Animations/Fiix/Fiix_RunAnim_East.gif',      mirrorSrc: true,  mirrorAnim: true  },
  NW: { src: '/Sprite/Fiix_NorthEast.png', anim: '/Sprite/Animations/Fiix/Fiix_RunAnim_NorthWest.gif', mirrorSrc: true,  mirrorAnim: false },
}

function getDir(dx, dy) {
  const a = (Math.atan2(dy, dx) * 180) / Math.PI
  if (a >= -22.5 && a < 22.5) return 'E'
  if (a >= 22.5 && a < 67.5) return 'SE'
  if (a >= 67.5 && a < 112.5) return 'S'
  if (a >= 112.5 && a < 157.5) return 'SW'
  if (a >= 157.5 || a < -157.5) return 'W'
  if (a >= -157.5 && a < -112.5) return 'NW'
  if (a >= -112.5 && a < -67.5) return 'N'
  return 'NE'
}

/* ------------------------------------------------------------------ *
 * Tunables
 * ------------------------------------------------------------------ */
const SPRITE_SIZE = 80
const MOVE_SPEED = 3
const FOLLOW_DIST = 80          // stop when the cursor is this close
const ARRIVE_SLOW = 150         // begin easing speed within this of cursor

const CELL = 24                 // nav-grid cell size, px
const CLEARANCE = 38            // keep sprite center this far from component edges
const MAX_CELLS = 24000         // safety cap; above this, fall back to direct steering
const REPLAN_MS = 220           // recompute the route at most this often
const CURSOR_MOVE_REPLAN = 60   // force a replan if the cursor jumps this far
const WAYPOINT_REACH = CELL     // advance to the next waypoint within this

const SEPARATION_DIST = SPRITE_SIZE * 1.0   // start steering apart at this gap
const MIN_SEP = SPRITE_SIZE * 0.72          // hard floor: centers never closer than this

const RETURN_THRESHOLD = 10

// Greeting ("sit when two sprites meet") — set false for pure collision boundaries.
const ENABLE_GREETING = true
const COLLIDE_DIST = SPRITE_SIZE * 0.9      // greeting trigger (must be > MIN_SEP)
const SIT_DURATION = 3500
const GREET_COOLDOWN = SIT_DURATION + 4000

/*
 * IMPORTANT: only list discrete, box-like COMPONENTS here — never full-page
 * layout wrappers (.container, section, .page, .hero, header, footer, nav...).
 * Wrappers enclose the cursor, which would make the target unreachable.
 */
const COMPONENT_SELECTOR =
  '.card, .panel, .player-card, .sprite-card, .gold-border, [class*="widget"]'

/* ------------------------------------------------------------------ *
 * Shared module state
 * ------------------------------------------------------------------ */
let _obs = []
let _obsAt = 0
const greetLocks = {} // pairKey -> { at, sitter }

function refreshObstacles() {
  const now = performance.now()
  if (now - _obsAt < 200) return _obs
  const out = []
  document.querySelectorAll(COMPONENT_SELECTOR).forEach((el) => {
    const r = el.getBoundingClientRect()
    const w = r.width
    const h = r.height
    if (w < 24 || h < 24) return
    // Defensive: ignore anything page-sized that slipped through the selector.
    if (w > window.innerWidth * 0.92 && h > window.innerHeight * 0.9) return
    const left = r.left + window.scrollX
    const top = r.top + window.scrollY
    out.push({ left, top, right: left + w, bottom: top + h })
  })
  _obs = out
  _obsAt = now
  return _obs
}

/* ------------------------------------------------------------------ *
 * Geometry helpers (operate on CLEARANCE-inflated rects)
 * ------------------------------------------------------------------ */
function pointBlocked(x, y, obs) {
  for (const o of obs) {
    if (
      x >= o.left - CLEARANCE && x <= o.right + CLEARANCE &&
      y >= o.top - CLEARANCE && y <= o.bottom + CLEARANCE
    )
      return true
  }
  return false
}

function segBlocked(ax, ay, bx, by, obs) {
  const dist = Math.hypot(bx - ax, by - ay)
  const steps = Math.max(1, Math.ceil(dist / (CELL * 0.5)))
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    if (pointBlocked(ax + (bx - ax) * t, ay + (by - ay) * t, obs)) return true
  }
  return false
}

/* ------------------------------------------------------------------ *
 * Tiny binary min-heap (keyed on .f)
 * ------------------------------------------------------------------ */
function heapPush(h, node) {
  h.push(node)
  let i = h.length - 1
  while (i > 0) {
    const p = (i - 1) >> 1
    if (h[p].f <= h[i].f) break
    const t = h[p]; h[p] = h[i]; h[i] = t
    i = p
  }
}
function heapPop(h) {
  const top = h[0]
  const last = h.pop()
  if (h.length) {
    h[0] = last
    let i = 0
    const n = h.length
    for (;;) {
      const l = i * 2 + 1, r = i * 2 + 2
      let s = i
      if (l < n && h[l].f < h[s].f) s = l
      if (r < n && h[r].f < h[s].f) s = r
      if (s === i) break
      const t = h[s]; h[s] = h[i]; h[i] = t
      i = s
    }
  }
  return top
}

/* ------------------------------------------------------------------ *
 * A* pathfinder -> returns array of world-space waypoints, or null.
 * `obs` should already exclude rects containing the sprite or the cursor.
 * ------------------------------------------------------------------ */
function planPath(sx, sy, gx, gy, obs) {
  const PAD = 220
  let minX = Math.min(sx, gx) - PAD
  let minY = Math.min(sy, gy) - PAD
  let maxX = Math.max(sx, gx) + PAD
  let maxY = Math.max(sy, gy) + PAD
  for (const o of obs) {
    if (o.right < minX || o.left > maxX || o.bottom < minY || o.top > maxY) continue
    minX = Math.min(minX, o.left - CLEARANCE - CELL)
    minY = Math.min(minY, o.top - CLEARANCE - CELL)
    maxX = Math.max(maxX, o.right + CLEARANCE + CELL)
    maxY = Math.max(maxY, o.bottom + CLEARANCE + CELL)
  }

  const cols = Math.ceil((maxX - minX) / CELL)
  const rows = Math.ceil((maxY - minY) / CELL)
  if (cols < 1 || rows < 1 || cols * rows > MAX_CELLS) return null

  const idx = (c, r) => r * cols + c
  const blocked = new Uint8Array(cols * rows)
  for (let r = 0; r < rows; r++) {
    const wy = minY + (r + 0.5) * CELL
    for (let c = 0; c < cols; c++) {
      if (pointBlocked(minX + (c + 0.5) * CELL, wy, obs)) blocked[idx(c, r)] = 1
    }
  }

  const toCell = (x, y) => [
    Math.max(0, Math.min(cols - 1, Math.floor((x - minX) / CELL))),
    Math.max(0, Math.min(rows - 1, Math.floor((y - minY) / CELL))),
  ]
  const [sc, sr] = toCell(sx, sy)
  let [gc, gr] = toCell(gx, gy)
  blocked[idx(sc, sr)] = 0 // always allow escaping the start cell

  // If the goal cell is solid (cursor over a component), snap to nearest free cell.
  let goalRelocated = false
  if (blocked[idx(gc, gr)]) {
    let found = null
    outer: for (let ring = 1; ring < Math.max(cols, rows); ring++) {
      for (let dc = -ring; dc <= ring; dc++) {
        for (let dr = -ring; dr <= ring; dr++) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) !== ring) continue
          const c = gc + dc, r = gr + dr
          if (c < 0 || r < 0 || c >= cols || r >= rows) continue
          if (!blocked[idx(c, r)]) { found = [c, r]; break outer }
        }
      }
    }
    if (!found) return null
    gc = found[0]; gr = found[1]
    goalRelocated = true
  }

  const N = cols * rows
  const gScore = new Float64Array(N).fill(Infinity)
  const came = new Int32Array(N).fill(-1)
  const closed = new Uint8Array(N)
  const start = idx(sc, sr)
  const goal = idx(gc, gr)

  const heur = (c, r) => {
    const dx = Math.abs(c - gc), dy = Math.abs(r - gr)
    return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy)
  }

  gScore[start] = 0
  const open = []
  heapPush(open, { i: start, f: heur(sc, sr) })

  const DIRS = [
    [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
    [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
  ]

  let reached = false
  while (open.length) {
    const cur = heapPop(open)
    if (closed[cur.i]) continue
    closed[cur.i] = 1
    if (cur.i === goal) { reached = true; break }
    const cc = cur.i % cols
    const cr = (cur.i / cols) | 0
    for (const [dc, dr, cost] of DIRS) {
      const nc = cc + dc, nr = cr + dr
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue
      const ni = idx(nc, nr)
      if (blocked[ni] || closed[ni]) continue
      // no diagonal corner-cutting through solid cells
      if (dc !== 0 && dr !== 0 && (blocked[idx(cc + dc, cr)] || blocked[idx(cc, cr + dr)])) continue
      const tentative = gScore[cur.i] + cost
      if (tentative < gScore[ni]) {
        gScore[ni] = tentative
        came[ni] = cur.i
        heapPush(open, { i: ni, f: tentative + heur(nc, nr) })
      }
    }
  }
  if (!reached) return null

  // Reconstruct cell path, then convert to world-space points.
  const cells = []
  for (let i = goal; i !== -1; i = came[i]) cells.push(i)
  cells.reverse()

  const center = (i) => ({
    x: minX + ((i % cols) + 0.5) * CELL,
    y: minY + (((i / cols) | 0) + 0.5) * CELL,
  })

  const pts = [{ x: sx, y: sy }]
  for (const ci of cells) pts.push(center(ci))
  // Final target: real cursor if reachable, else the snapped boundary cell.
  pts.push(goalRelocated ? center(goal) : { x: gx, y: gy })

  // String-pulling: drop waypoints we can reach in a straight line.
  const out = [pts[0]]
  let i = 0
  while (i < pts.length - 1) {
    let j = pts.length - 1
    while (j > i + 1 && segBlocked(pts[i].x, pts[i].y, pts[j].x, pts[j].y, obs)) j--
    out.push(pts[j])
    i = j
  }
  return out
}

/* ------------------------------------------------------------------ *
 * Component
 * ------------------------------------------------------------------ */
export default function SpriteFollower({
  active, originRect, returnTarget, onReturned, spriteId, spritePositionsRef,
}) {
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [dir, setDir] = useState('S')
  const [moving, setMoving] = useState(false)
  const [hidden, setHidden] = useState(true)
  const [sitting, setSitting] = useState(false)

  const posRef = useRef({ x: 0, y: 0 })
  const cursorRef = useRef({ x: 0, y: 0 })
  const modeRef = useRef('idle')
  const animRef = useRef(null)

  const returnTargetRef = useRef(null)
  const onReturnedRef = useRef(onReturned)
  onReturnedRef.current = onReturned

  const pathRef = useRef(null)
  const pathIdxRef = useRef(1)
  const lastPlanRef = useRef(0)
  const planGoalRef = useRef({ x: 0, y: 0 })

  const sittingRef = useRef(false)
  const sitTimerRef = useRef(null)

  useEffect(() => {
    if (!active || !originRect) return

    const cx = originRect.left + originRect.width / 2 + window.scrollX
    const cy = originRect.top + originRect.height / 2 + window.scrollY

    posRef.current = { x: cx, y: cy }
    cursorRef.current = { x: cx, y: cy }
    setPos({ x: cx, y: cy })
    setDir('S'); setMoving(false); setHidden(false); setSitting(false)
    modeRef.current = 'follow'
    returnTargetRef.current = null
    pathRef.current = null
    pathIdxRef.current = 1
    lastPlanRef.current = 0
    sittingRef.current = false
    if (sitTimerRef.current) { clearTimeout(sitTimerRef.current); sitTimerRef.current = null }
    if (spritePositionsRef) spritePositionsRef.current[spriteId] = { x: cx, y: cy }

    const onMouse = (e) => {
      cursorRef.current = { x: e.clientX + window.scrollX, y: e.clientY + window.scrollY }
    }
    window.addEventListener('mousemove', onMouse)

    /* -------------------------------------------------------------- *
     * Continuous separation: never overlap another sprite.
     * -------------------------------------------------------------- */
    function separationVelocity(p, positions) {
      let sx = 0, sy = 0
      for (const id in positions) {
        if (id === spriteId) continue
        const o = positions[id]
        if (!o || typeof o.x !== 'number') continue
        const dx = p.x - o.x, dy = p.y - o.y
        const d = Math.hypot(dx, dy)
        if (d > 0 && d < SEPARATION_DIST) {
          const push = (SEPARATION_DIST - d) / SEPARATION_DIST
          sx += (dx / d) * push
          sy += (dy / d) * push
        }
      }
      return { x: sx, y: sy }
    }

    function resolveOverlap(p, positions) {
      for (const id in positions) {
        if (id === spriteId) continue
        const o = positions[id]
        if (!o || typeof o.x !== 'number') continue
        let dx = p.x - o.x, dy = p.y - o.y
        let d = Math.hypot(dx, dy)
        if (d === 0) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d = Math.hypot(dx, dy) || 1 }
        if (d < MIN_SEP) {
          const corr = (MIN_SEP - d) / 2 // each side moves half; both run this
          p.x += (dx / d) * corr
          p.y += (dy / d) * corr
        }
      }
    }

    function loop() {
      const p = posRef.current

      /* -------- return-to-card mode -------- */
      if (modeRef.current === 'return') {
        const rt = returnTargetRef.current
        if (!rt) { animRef.current = requestAnimationFrame(loop); return }
        const dx = rt.x - p.x, dy = rt.y - p.y
        const dist = Math.hypot(dx, dy)
        if (dist < RETURN_THRESHOLD) {
          setHidden(true); setSitting(false)
          if (spritePositionsRef) delete spritePositionsRef.current[spriteId]
          modeRef.current = 'idle'
          onReturnedRef.current?.(spriteId)
          return
        }
        const vx = (dx / dist) * MOVE_SPEED
        const vy = (dy / dist) * MOVE_SPEED
        p.x += vx; p.y += vy
        if (spritePositionsRef) spritePositionsRef.current[spriteId] = { x: p.x, y: p.y }
        setPos({ x: p.x, y: p.y }); setDir(getDir(vx, vy)); setMoving(true)
        animRef.current = requestAnimationFrame(loop)
        return
      }

      if (modeRef.current !== 'follow') { animRef.current = requestAnimationFrame(loop); return }
      if (sittingRef.current) { setMoving(false); animRef.current = requestAnimationFrame(loop); return }

      const positions = spritePositionsRef ? spritePositionsRef.current : {}
      const cursor = cursorRef.current

      /* -------- greeting / sit (deterministic, shared lock) -------- */
      if (ENABLE_GREETING && positions) {
        for (const otherId in positions) {
          if (otherId === spriteId) continue
          const o = positions[otherId]
          if (!o || typeof o.x !== 'number') continue
          if (Math.hypot(p.x - o.x, p.y - o.y) >= COLLIDE_DIST) continue

          const key = spriteId < otherId ? `${spriteId}|${otherId}` : `${otherId}|${spriteId}`
          const now = Date.now()
          let lock = greetLocks[key]
          if (!lock || now - lock.at > GREET_COOLDOWN) {
            lock = greetLocks[key] = { at: now, sitter: Math.random() < 0.5 ? spriteId : otherId }
          }
          if (lock.sitter === spriteId && now - lock.at < SIT_DURATION) {
            sittingRef.current = true
            setSitting(true); setMoving(false)
            if (sitTimerRef.current) clearTimeout(sitTimerRef.current)
            sitTimerRef.current = setTimeout(() => {
              sittingRef.current = false
              setSitting(false)
              greetLocks[key] = { at: Date.now(), sitter: null } // start cooldown from sit end
            }, SIT_DURATION - (now - lock.at))
            animRef.current = requestAnimationFrame(loop)
            return
          }
        }
      }

      /* -------- obstacles, excluding the box under sprite or cursor -------- */
      const allObs = refreshObstacles()
      const obs = allObs.filter(
        (o) =>
          !(cursor.x >= o.left && cursor.x <= o.right && cursor.y >= o.top && cursor.y <= o.bottom) &&
          !(p.x >= o.left && p.x <= o.right && p.y >= o.top && p.y <= o.bottom)
      )

      const dxC = cursor.x - p.x, dyC = cursor.y - p.y
      const distC = Math.hypot(dxC, dyC)
      const arrived = distC <= FOLLOW_DIST

      /* -------- (re)plan route -------- */
      if (!arrived) {
        const now = performance.now()
        const goalMoved = Math.hypot(cursor.x - planGoalRef.current.x, cursor.y - planGoalRef.current.y)
        const needPlan =
          !pathRef.current ||
          pathIdxRef.current >= (pathRef.current?.length || 0) ||
          goalMoved > CURSOR_MOVE_REPLAN ||
          now - lastPlanRef.current > REPLAN_MS
        if (needPlan) {
          const route = planPath(p.x, p.y, cursor.x, cursor.y, obs)
          pathRef.current = route
          pathIdxRef.current = 1
          lastPlanRef.current = now
          planGoalRef.current = { x: cursor.x, y: cursor.y }
        }
      } else {
        pathRef.current = null
      }

      /* -------- choose seek target (waypoint or cursor) -------- */
      let target = cursor
      const path = pathRef.current
      if (path && pathIdxRef.current < path.length) {
        target = path[pathIdxRef.current]
        if (Math.hypot(p.x - target.x, p.y - target.y) < WAYPOINT_REACH) {
          pathIdxRef.current++
          target = path[Math.min(pathIdxRef.current, path.length - 1)] || cursor
        }
      }

      /* -------- velocity = seek + separation -------- */
      let vx = 0, vy = 0
      if (!arrived) {
        const tdx = target.x - p.x, tdy = target.y - p.y
        const td = Math.hypot(tdx, tdy) || 1
        const ease = distC < ARRIVE_SLOW ? Math.max(0.25, distC / ARRIVE_SLOW) : 1
        vx = (tdx / td) * MOVE_SPEED * ease
        vy = (tdy / td) * MOVE_SPEED * ease
      }
      const sep = separationVelocity(p, positions)
      vx += sep.x * MOVE_SPEED
      vy += sep.y * MOVE_SPEED

      // clamp combined speed
      const vmag = Math.hypot(vx, vy)
      const maxV = MOVE_SPEED * 1.4
      if (vmag > maxV) { vx = (vx / vmag) * maxV; vy = (vy / vmag) * maxV }

      /* -------- move, sliding along blocked edges -------- */
      const before = { x: p.x, y: p.y }
      const insideNow = pointBlocked(p.x, p.y, obs) // mid-escape: don't re-trap
      let nx = p.x + vx, ny = p.y + vy
      if (!insideNow && pointBlocked(nx, ny, obs)) {
        if (!pointBlocked(p.x + vx, p.y, obs)) ny = p.y
        else if (!pointBlocked(p.x, p.y + vy, obs)) nx = p.x
        else { nx = p.x; ny = p.y }
      }
      p.x = nx; p.y = ny

      // hard de-overlap so collision boundaries always hold
      resolveOverlap(p, positions)

      if (spritePositionsRef) spritePositionsRef.current[spriteId] = { x: p.x, y: p.y }

      const mdx = p.x - before.x, mdy = p.y - before.y
      const moved = Math.hypot(mdx, mdy) > 0.4
      if (moved) setDir(getDir(mdx, mdy))
      setPos({ x: p.x, y: p.y })
      setMoving(moved && !arrived)

      animRef.current = requestAnimationFrame(loop)
    }

    animRef.current = requestAnimationFrame(loop)

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
      if (sitTimerRef.current) clearTimeout(sitTimerRef.current)
      window.removeEventListener('mousemove', onMouse)
      if (spritePositionsRef) delete spritePositionsRef.current[spriteId]
    }
  }, [active, originRect, spriteId, spritePositionsRef])

  useEffect(() => {
    returnTargetRef.current = returnTarget
    if (returnTarget && modeRef.current === 'follow') {
      sittingRef.current = false
      setSitting(false)
      if (sitTimerRef.current) { clearTimeout(sitTimerRef.current); sitTimerRef.current = null }
      modeRef.current = 'return'
    }
  }, [returnTarget])

  const handleDoubleClick = () => {
    if (hidden) return
    setHidden(true); setSitting(false)
    sittingRef.current = false
    if (sitTimerRef.current) { clearTimeout(sitTimerRef.current); sitTimerRef.current = null }
    if (spritePositionsRef) delete spritePositionsRef.current[spriteId]
    if (animRef.current) cancelAnimationFrame(animRef.current)
    modeRef.current = 'idle'
    onReturnedRef.current?.(spriteId)
  }

  if (hidden) return null

  if (sitting) {
    return (
      <img
        src="/Sprite/FiixSit.png"
        className="sprite-follower sitting"
        style={{
          left: 0, top: 0,
          transform: `translate(${pos.x}px, ${pos.y}px) translate(-50%, -50%)`,
          pointerEvents: 'auto',
        }}
        alt="Fiix"
        onDoubleClick={handleDoubleClick}
      />
    )
  }

  const dirInfo = DIR_MAP[dir]
  const src = moving ? dirInfo.anim : dirInfo.src
  const mirror = moving ? dirInfo.mirrorAnim : dirInfo.mirrorSrc

  return (
    <img
      src={src}
      className={`sprite-follower ${moving ? 'running' : 'idle'}`}
      style={{
        left: 0, top: 0,
        transform: `translate(${pos.x}px, ${pos.y}px) translate(-50%, -50%) ${mirror ? 'scaleX(-1)' : ''}`,
        pointerEvents: 'auto',
      }}
      alt="Fiix"
      onDoubleClick={handleDoubleClick}
    />
  )
}
