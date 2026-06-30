/**
 * EventBus — lightweight pub/sub for the VTT canvas.
 *
 * Two categories of messages:
 *   1. Persistent-record events (template-created, -moved, -deleted, etc.)
 *      intended for a future sync adapter that writes to the server.
 *   2. Ephemeral-channel messages (ruler-in-progress, future pings/cursors)
 *      intended for transient real-time broadcast to other clients.
 *
 * Seam comment for pings/cursors (Stage 3):
 *   The `ephemeral` channel carries transient per-user overlays.
 *   To add pings or cursors, emit on 'ephemeral' with a type field,
 *   e.g. { type: 'ping', x, y, playerId }. The same channel is used
 *   by the RulerLayer for live ruler sharing.
 */
export class EventBus {
  constructor() {
    this._listeners = {}
  }

  on(event, fn) {
    ;(this._listeners[event] ??= []).push(fn)
    return () => this.off(event, fn)
  }

  off(event, fn) {
    const list = this._listeners[event]
    if (!list) return
    const idx = list.indexOf(fn)
    if (idx !== -1) list.splice(idx, 1)
  }

  emit(event, payload) {
    const list = this._listeners[event]
    if (!list) return
    for (const fn of list) {
      try { fn(payload) } catch (e) { console.warn('EventBus handler error', event, e) }
    }
  }

  /**
   * Shorthand for record CRUD events on a resource type.
   * Emits both a specific event (e.g. 'template:created') and a generic
   * 'record:changed' for broad listeners.
   */
  emitRecord(resource, action, data) {
    this.emit(`${resource}:${action}`, data)
    this.emit('record:changed', { resource, action, data })
  }

  /**
   * Shorthand for ephemeral overlays.
   * Emits 'ephemeral' with { type, ...payload }.
   * The separate event name makes it easy for a future sync adapter
   * to subscribe only to transient messages.
   */
  emitEphemeral(type, payload) {
    this.emit('ephemeral', { type, ...payload })
  }

  destroy() {
    this._listeners = {}
  }
}
