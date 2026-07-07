import { useReducer, useCallback, useEffect } from 'react'

/**
 * A small modal window stack: overlays are pushed by id; Esc pops the top one.
 * This replaces per-overlay Escape listeners so nested overlays close in order.
 */

/* ---- pure reducer (unit-tested) ---- */
export function windowStackReducer(stack, action) {
  switch (action.type) {
    case 'open':    return [...stack.filter(x => x !== action.id), action.id]
    case 'close':   return stack.filter(x => x !== action.id)
    case 'toggle':  return stack.includes(action.id)
      ? stack.filter(x => x !== action.id)
      : [...stack.filter(x => x !== action.id), action.id]
    case 'closeTop': return stack.slice(0, -1)
    case 'closeAll': return []
    default: return stack
  }
}

/* ---- pure hotkey resolution (unit-tested) ---- */
export const HOTKEYS = { i: 'inventory', c: 'inventory', l: 'loot', p: 'party' }
export const HOTKEY_LABELS = { inventory: 'I', loot: 'L', party: 'P' }

/** Map a key to a stack action, given whether anything is open. */
export function resolveHotkey(key, { hasTop } = {}) {
  const k = (key || '').toLowerCase()
  if (k === 'escape') return hasTop ? { type: 'closeTop' } : null
  if (HOTKEYS[k]) return { type: 'toggle', id: HOTKEYS[k] }
  return null
}

/* ---- hooks ---- */
export function useWindowStack() {
  const [stack, dispatch] = useReducer(windowStackReducer, [])
  const open = useCallback((id) => dispatch({ type: 'open', id }), [])
  const close = useCallback((id) => dispatch({ type: 'close', id }), [])
  const toggle = useCallback((id) => dispatch({ type: 'toggle', id }), [])
  const closeTop = useCallback(() => dispatch({ type: 'closeTop' }), [])
  const isOpen = useCallback((id) => stack.includes(id), [stack])
  return { stack, open, close, toggle, closeTop, isOpen, top: stack[stack.length - 1] ?? null, dispatch }
}

/**
 * Global keyboard layer. Suppressed while typing in a field. `enabled` lets the
 * host turn it off (e.g. while a non-stack modal is open).
 */
export function useVttHotkeys({ dispatch, hasTop, enabled = true }) {
  useEffect(() => {
    if (!enabled) return
    const onKey = (e) => {
      const el = e.target
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      const action = resolveHotkey(e.key, { hasTop })
      if (action) { e.preventDefault(); dispatch(action) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dispatch, hasTop, enabled])
}
