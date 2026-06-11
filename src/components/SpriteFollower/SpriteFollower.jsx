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
const OBSTACLE_PADDING = 8

const OBSTACLE_SELECTOR = '.card, section, .panel, header, footer, nav, aside, [class*="container"], [class*="widget"], [class*="grid"], [class*="hero"]'

let obstacleCache = []
let lastObstacleUpdate = 0

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

function avoidObstacles(x, y, obstacles, targetX, targetY) {
  for (const o of obstacles) {
    const nearX = x >= o.left - OBSTACLE_PADDING && x <= o.right + OBSTACLE_PADDING
    const nearY = y >= o.top - OBSTACLE_PADDING && y <= o.bottom + OBSTACLE_PADDING
    if (!nearX || !nearY) continue

    const distLeft = Math.abs(targetX - o.left)
    const distRight = Math.abs(targetX - o.right)
    const distTop = Math.abs(targetY - o.top)
    const distBottom = Math.abs(targetY - o.bottom)
    const min = Math.min(distLeft, distRight, distTop, distBottom)

    if (min === distLeft || min === distRight) {
      if (min === distLeft) x = o.left - OBSTACLE_PADDING
      else x = o.right + OBSTACLE_PADDING
      y += Math.sign(targetY - y) * MOVE_SPEED * 1.2
    } else {
      if (min === distTop) y = o.top - OBSTACLE_PADDING
      else y = o.bottom + OBSTACLE_PADDING
      x += Math.sign(targetX - x) * MOVE_SPEED * 1.2
    }
  }
  return { x, y }
}

export default function SpriteFollower({ active, originRect, returnTarget, onReturned }) {
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [dir, setDir] = useState('S')
  const [moving, setMoving] = useState(false)
  const [hidden, setHidden] = useState(true)

  const posRef = useRef({ x: 0, y: 0 })
  const cursorRef = useRef({ x: 0, y: 0 })
  const modeRef = useRef('idle')
  const cooldownRef = useRef(false)
  const cooldownTimerRef = useRef(null)
  const animRef = useRef(null)
  const returnTargetRef = useRef(null)
  const onReturnedRef = useRef(onReturned)
  onReturnedRef.current = onReturned

  useEffect(() => {
    if (!active || !originRect) return

    const cx = originRect.left + originRect.width / 2 + window.scrollX
    const cy = originRect.top + originRect.height / 2 + window.scrollY

    posRef.current = { x: cx, y: cy }
    cursorRef.current = { x: cx, y: cy }
    setPos({ x: cx, y: cy })
    setDir('S')
    setMoving(false)
    setHidden(false)
    modeRef.current = 'follow'
    cooldownRef.current = false
    returnTargetRef.current = null

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
          modeRef.current = 'idle'
          onReturnedRef.current?.()
          return
        }

        const vx = (dx / dist) * MOVE_SPEED
        const vy = (dy / dist) * MOVE_SPEED
        const avoided = avoidObstacles(p.x + vx, p.y + vy, getObstacles(cx, cy), rt.x, rt.y)
        p.x = avoided.x
        p.y = avoided.y

        const d = getDir(dx, dy)
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

      const vx = (dx / dist) * MOVE_SPEED
      const vy = (dy / dist) * MOVE_SPEED
      const avoided = avoidObstacles(p.x + vx, p.y + vy, getObstacles(cx, cy), c.x, c.y)
      p.x = avoided.x
      p.y = avoided.y

      const d = getDir(dx, dy)
      setPos({ x: p.x, y: p.y })
      setDir(d)
      setMoving(true)

      animRef.current = requestAnimationFrame(loop)
    }

    animRef.current = requestAnimationFrame(loop)

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
      if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current)
      window.removeEventListener('mousemove', onMouse)
    }
  }, [active, originRect])

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

  if (hidden) return null

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
      }}
      alt="Fiix"
    />
  )
}
