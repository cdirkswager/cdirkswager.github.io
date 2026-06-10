import { useEffect, useRef, useState } from 'react'
import './SpriteFollower.css'

const DIR_MAP = {
  N:  { src: '/Sprite/Fiix_North.png', anim: '/Sprite/Animations/Fiix/Fiix_RunAnim_North.gif', mirror: false },
  NE: { src: '/Sprite/Fiix_NorthEast.png', anim: '/Sprite/Animations/Fiix/Fiix_RunAnim_NorthWest.gif', mirror: true },
  E:  { src: '/Sprite/Fiix_East.png', anim: '/Sprite/Animations/Fiix/Fiix_RunAnim_East.gif', mirror: false },
  SE: { src: '/Sprite/Fiix_SouthEast.png', anim: '/Sprite/Animations/Fiix/Fiix_RunAnim_SouthEast.gif', mirror: false },
  S:  { src: '/Sprite/Fiix_South.png', anim: '/Sprite/Animations/Fiix/Fiix_RunAnim_South.gif', mirror: false },
  SW: { src: '/Sprite/Fiix_SouthEast.png', anim: '/Sprite/Animations/Fiix/Fiix_RunAnim_SouthEast.gif', mirror: true },
  W:  { src: '/Sprite/Fiix_East.png', anim: '/Sprite/Animations/Fiix/Fiix_RunAnim_East.gif', mirror: true },
  NW: { src: '/Sprite/Fiix_NorthEast.png', anim: '/Sprite/Animations/Fiix/Fiix_RunAnim_NorthWest.gif', mirror: true },
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
        p.x += vx
        p.y += vy

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
      p.x += vx
      p.y += vy

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

  return (
    <img
      src={src}
      className={`sprite-follower ${moving ? 'running' : 'idle'}`}
      style={{
        left: 0,
        top: 0,
        transform: `translate(${pos.x}px, ${pos.y}px) translate(-50%, -50%) ${dirInfo.mirror ? 'scaleX(-1)' : ''}`,
      }}
      alt="Fiix"
    />
  )
}
