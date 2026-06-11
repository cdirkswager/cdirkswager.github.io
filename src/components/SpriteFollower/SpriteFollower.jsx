import { useEffect, useRef, useState } from 'react'
import './SpriteFollower.css'

const DIR_MAP = {
  N:  { src: '/Sprite/Fiix_North.png', anim: '/Sprite/Animations/Fiix/Fiix_RunAnim_North.gif', mirrorSrc: false, mirrorAnim: false },
  NE: { src: '/Sprite/Fiix_NorthEast.png', anim: '/Sprite/Animations/Fiix/Fiix_RunAnim_NorthWest.gif', mirrorSrc: false, mirrorAnim: true },
  E:  { src: '/Sprite/Fiix_East.png', anim: '/Sprite/Animations/Fiix/Fiix_RunAnim_East.gif', mirrorSrc: false, mirrorAnim: false },
  SE: { src: '/Sprite/Fiix_SouthEast.png', anim: '/Sprite/Animations/Fiix/Fiix_RunAnim_SouthEast.gif', mirrorSrc: false, mirrorAnim: false },
  S:  { src: '/Sprite/Fiix_South.png', anim: '/Sprite/Animations/Fiix/Fiix_RunAnim_South.gif', mirrorSrc: false, mirrorAnim: false },
  SW: { src: '/Sprite/Fiix_SouthEast.png', anim: '/Sprite/Animations/Fiix/Fiix_RunAnim_SouthEast.gif', mirrorSrc: true, mirrorAnim: true },
  W:  { src: '/Sprite/Fiix_East.png', anim: '/Sprite/Animations/Fiix/Fiix_RunAnim_East.gif', mirrorSrc: true, mirrorAnim: true },
  NW: { src: '/Sprite/Fiix_NorthEast.png', anim: '/Sprite/Animations/Fiix/Fiix_RunAnim_NorthWest.gif', mirrorSrc: true, mirrorAnim: false },
}

function getDir(dx, dy) {
  const a = Math.atan2(dy, dx) * 180 / Math.PI
  if (a >= -22.5 && a < 22.5) return 'E'
  if (a >= 22.5 && a < 67.5) return 'SE'
  if (a >= 67.5 && a < 112.5) return 'S'
  if (a >= 112.5 && a < 157.5) return 'SW'
  if (a >= 157.5 || a < -157.5) return 'W'
  if (a >= -157.5 && a < -112.5) return 'NW'
  if (a >= -112.5 && a < -67.5) return 'N'
  return 'NE'
}

const FOLLOW_DIST = 80
const MOVE_SPEED = 3
const COOLDOWN_MS = 1500
const RETURN_THRESHOLD = 10
const OBSTACLE_PADDING = 42
const SPRITE_SIZE = 80
const COLLIDE_DIST = SPRITE_SIZE * 0.75

const STUCK_FRAMES = 90
const STUCK_THRESHOLD = 0.9
const STUCK_REST_MS = 3000

const SIT_DURATION = 3500

const OBSTACLE_SELECTOR = '.card, section, .panel, header, footer, nav, aside, [class*="container"], [class*="widget"], [class*="grid"], [class*="hero"]'

let obstacleCache = []
let lastObstacleUpdate = 0
const collisionLocks = {}

function getObstacles(startX, startY) {
  const now = Date.now()
  if (now - lastObstacleUpdate > 300) {
    const els = document.querySelectorAll(OBSTACLE_SELECTOR)
    obstacleCache = []
    els.forEach(el => {
      const r = el.getBoundingClientRect()
      const left = r.left + window.scrollX
      const right = r.right + window.scrollX
      const top = r.top + window.scrollY
      const bottom = r.bottom + window.scrollY
      if (left <= startX && right >= startX && top <= startY && bottom >= startY) return
      const w = right - left
      const h = bottom - top
      if (w < 20 || h < 20) return
      obstacleCache.push({ left, right, top, bottom })
    })
    lastObstacleUpdate = now
  }
  return obstacleCache
}

function steerAround(x, y, vx, vy, obstacles, targetX, targetY) {
  for (const o of obstacles) {
    const nextX = x + vx
    const nextY = y + vy

    const nextInX = nextX >= o.left - OBSTACLE_PADDING && nextX <= o.right + OBSTACLE_PADDING
    const nextInY = nextY >= o.top - OBSTACLE_PADDING && nextY <= o.bottom + OBSTACLE_PADDING
    if (!nextInX || !nextInY) continue

    const corners = [
      { x: o.left - OBSTACLE_PADDING, y: o.top - OBSTACLE_PADDING },
      { x: o.right + OBSTACLE_PADDING, y: o.top - OBSTACLE_PADDING },
      { x: o.left - OBSTACLE_PADDING, y: o.bottom + OBSTACLE_PADDING },
      { x: o.right + OBSTACLE_PADDING, y: o.bottom + OBSTACLE_PADDING },
    ]

    let best = null
    let bestDist = Infinity
    for (const c of corners) {
      const toTarget = Math.hypot(targetX - c.x, targetY - c.y)
      const toSprite = Math.hypot(x - c.x, y - c.y)
      if (toTarget + toSprite < bestDist) { bestDist = toTarget + toSprite; best = c }
    }

    if (best) {
      const cdx = best.x - x
      const cdy = best.y - y
      const cd = Math.hypot(cdx, cdy)
      if (cd > 1) {
        vx = (cdx / cd) * MOVE_SPEED
        vy = (cdy / cd) * MOVE_SPEED
      }
    }
  }
  return { vx, vy }
}

export default function SpriteFollower({ active, originRect, returnTarget, onReturned, spriteId, spritePositionsRef }) {
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [dir, setDir] = useState('S')
  const [moving, setMoving] = useState(false)
  const [hidden, setHidden] = useState(true)
  const [sitting, setSitting] = useState(false)

  const posRef = useRef({ x: 0, y: 0 })
  const cursorRef = useRef({ x: 0, y: 0 })
  const modeRef = useRef('idle')
  const cooldownRef = useRef(false)
  const cooldownTimerRef = useRef(null)
  const animRef = useRef(null)
  const returnTargetRef = useRef(null)
  const onReturnedRef = useRef(onReturned)
  const stickyRef = useRef(false)
  const stickyTimerRef = useRef(null)
  const lastPosRef = useRef({ x: 0, y: 0 })
  const stuckFramesRef = useRef(0)
  const sittingRef = useRef(false)
  const sitTimerRef = useRef(null)
  const wasOverlappingRef = useRef({})
  onReturnedRef.current = onReturned

  useEffect(() => {
    if (!active || !originRect) return

    const cx = originRect.left + originRect.width / 2 + window.scrollX
    const cy = originRect.top + originRect.height / 2 + window.scrollY

    posRef.current = { x: cx, y: cy }
    lastPosRef.current = { x: cx, y: cy }
    cursorRef.current = { x: cx, y: cy }
    setPos({ x: cx, y: cy })
    setDir('S')
    setMoving(false)
    setHidden(false)
    setSitting(false)
    modeRef.current = 'follow'
    cooldownRef.current = false
    returnTargetRef.current = null
    stickyRef.current = false
    stuckFramesRef.current = 0
    sittingRef.current = false
    wasOverlappingRef.current = {}
    if (sitTimerRef.current) { clearTimeout(sitTimerRef.current); sitTimerRef.current = null }

    if (spritePositionsRef) {
      spritePositionsRef.current[spriteId] = { x: cx, y: cy }
    }

    const onMouse = (e) => {
      cursorRef.current = { x: e.clientX + window.scrollX, y: e.clientY + window.scrollY }
    }
    window.addEventListener('mousemove', onMouse)

    function loop() {
      const p = posRef.current

      if (modeRef.current === 'return') {
        const rt = returnTargetRef.current
        if (!rt) { animRef.current = requestAnimationFrame(loop); return }

        const dx = rt.x - p.x
        const dy = rt.y - p.y
        const dist = Math.sqrt(dx * dx + dy * dy)

        if (dist < RETURN_THRESHOLD) {
          setHidden(true)
          setSitting(false)
          if (spritePositionsRef) {
            delete spritePositionsRef.current[spriteId]
          }
          modeRef.current = 'idle'
          onReturnedRef.current?.(spriteId)
          return
        }

        const vx = (dx / dist) * MOVE_SPEED
        const vy = (dy / dist) * MOVE_SPEED
        p.x += vx
        p.y += vy

        if (spritePositionsRef) {
          spritePositionsRef.current[spriteId] = { x: p.x, y: p.y }
        }

        const d = getDir(vx, vy)
        setPos({ x: p.x, y: p.y })
        setDir(d)
        setMoving(true)

        animRef.current = requestAnimationFrame(loop)
        return
      }

      if (modeRef.current !== 'follow') {
        animRef.current = requestAnimationFrame(loop)
        return
      }

      if (sittingRef.current) {
        setMoving(false)
        animRef.current = requestAnimationFrame(loop)
        return
      }

      if (stickyRef.current) {
        setMoving(false)
        animRef.current = requestAnimationFrame(loop)
        return
      }

      if (!sittingRef.current && !stickyRef.current && spritePositionsRef) {
        const positions = spritePositionsRef.current
        for (const [otherId, otherPos] of Object.entries(positions)) {
          if (otherId === spriteId) continue
          if (typeof otherPos.x !== 'number') continue
          const dist = Math.hypot(p.x - otherPos.x, p.y - otherPos.y)
          const isOverlapping = dist < COLLIDE_DIST
          const wasOverlapping = wasOverlappingRef.current[otherId] || false

          if (isOverlapping && !wasOverlapping) {
            const pairKey = spriteId < otherId ? `${spriteId}|${otherId}` : `${otherId}|${spriteId}`
            if (!collisionLocks[pairKey] || Date.now() - collisionLocks[pairKey] > SIT_DURATION + 1000) {
              if (spriteId < otherId) {
                const sitter = Math.random() < 0.5 ? spriteId : otherId
                collisionLocks[pairKey] = Date.now()
                if (sitter === spriteId) {
                  sittingRef.current = true
                  setSitting(true)
                  setMoving(false)
                  if (stickyTimerRef.current) { clearTimeout(stickyTimerRef.current); stickyTimerRef.current = null }
                  stickyRef.current = false
                  if (cooldownTimerRef.current) { clearTimeout(cooldownTimerRef.current); cooldownTimerRef.current = null }
                  cooldownRef.current = false
                  sitTimerRef.current = setTimeout(() => {
                    sittingRef.current = false
                    setSitting(false)
                    stuckFramesRef.current = 0
                  }, SIT_DURATION)
                  animRef.current = requestAnimationFrame(loop)
                  return
                }
              }
            }
          }

          wasOverlappingRef.current[otherId] = isOverlapping
        }
      }

      const c = cursorRef.current

      if (cooldownRef.current) {
        setMoving(false)
        animRef.current = requestAnimationFrame(loop)
        return
      }

      const dx = c.x - p.x
      const dy = c.y - p.y
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist < FOLLOW_DIST) {
        cooldownRef.current = true
        setMoving(false)
        cooldownTimerRef.current = setTimeout(() => {
          cooldownRef.current = false
        }, COOLDOWN_MS)
        animRef.current = requestAnimationFrame(loop)
        return
      }

      let vx = (dx / dist) * MOVE_SPEED
      let vy = (dy / dist) * MOVE_SPEED
      const obst = getObstacles(cx, cy)
      const steer = steerAround(p.x, p.y, vx, vy, obst, c.x, c.y)
      p.x += steer.vx
      p.y += steer.vy

      if (spritePositionsRef) {
        spritePositionsRef.current[spriteId] = { x: p.x, y: p.y }
      }

      const moveDelta = Math.hypot(p.x - lastPosRef.current.x, p.y - lastPosRef.current.y)
      lastPosRef.current = { x: p.x, y: p.y }

      if (moveDelta < STUCK_THRESHOLD) {
        stuckFramesRef.current++
        if (stuckFramesRef.current >= STUCK_FRAMES) {
          stickyRef.current = true
          setMoving(false)
          stickyTimerRef.current = setTimeout(() => {
            stickyRef.current = false
            stuckFramesRef.current = 0
          }, STUCK_REST_MS)
          animRef.current = requestAnimationFrame(loop)
          return
        }
      } else {
        stuckFramesRef.current = 0
      }

      const d = getDir(steer.vx, steer.vy)
      setPos({ x: p.x, y: p.y })
      setDir(d)
      setMoving(true)

      animRef.current = requestAnimationFrame(loop)
    }

    animRef.current = requestAnimationFrame(loop)

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
      if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current)
      if (stickyTimerRef.current) clearTimeout(stickyTimerRef.current)
      if (sitTimerRef.current) clearTimeout(sitTimerRef.current)
      window.removeEventListener('mousemove', onMouse)
      if (spritePositionsRef) {
        delete spritePositionsRef.current[spriteId]
      }
    }
  }, [active, originRect, spriteId, spritePositionsRef])

  useEffect(() => {
    returnTargetRef.current = returnTarget
    if (returnTarget && modeRef.current === 'follow') {
      cooldownRef.current = false
      if (cooldownTimerRef.current) {
        clearTimeout(cooldownTimerRef.current)
        cooldownTimerRef.current = null
      }
      modeRef.current = 'return'
    }
  }, [returnTarget])

  const handleDoubleClick = () => {
    if (hidden) return
    setHidden(true)
    setSitting(false)
    sittingRef.current = false
    if (sitTimerRef.current) { clearTimeout(sitTimerRef.current); sitTimerRef.current = null }
    if (spritePositionsRef) {
      delete spritePositionsRef.current[spriteId]
    }
    if (animRef.current) cancelAnimationFrame(animRef.current)
    if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current)
    if (stickyTimerRef.current) clearTimeout(stickyTimerRef.current)
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
          left: 0,
          top: 0,
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
        left: 0,
        top: 0,
        transform: `translate(${pos.x}px, ${pos.y}px) translate(-50%, -50%) ${mirror ? 'scaleX(-1)' : ''}`,
        pointerEvents: 'auto',
      }}
      alt="Fiix"
      onDoubleClick={handleDoubleClick}
    />
  )
}