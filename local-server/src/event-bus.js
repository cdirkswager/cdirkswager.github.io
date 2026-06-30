export function createEventBus() {
  const listeners = new Map()

  function on(event, handler) {
    if (!listeners.has(event)) listeners.set(event, new Set())
    listeners.get(event).add(handler)
    return () => listeners.get(event)?.delete(handler)
  }

  function emit(event, payload) {
    const handlers = listeners.get(event)
    if (!handlers) return
    for (const handler of handlers) {
      try { handler(payload) } catch (e) { console.error(`[event-bus] Error in handler for "${event}":`, e) }
    }
  }

  function off(event, handler) {
    listeners.get(event)?.delete(handler)
  }

  return { on, off, emit }
}
