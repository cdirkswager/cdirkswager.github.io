import { WebSocketServer } from 'ws'
import crypto from 'node:crypto'
import { getAccessLevel, hasAccess } from '../../src/vtt/canvas/ownership.js'

export function createWebSocketHub(server, authVerifier, store, eventBus) {
  const wss = new WebSocketServer({ server })
  const connections = new Map() // ws -> { userId, username, role, playerId }

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://localhost')
    const token = url.searchParams.get('token')

    console.log(`[WS] inbound connection, token present: ${!!token}, tokenLen: ${token?.length ?? 0}`)

    const identity = authVerifier.verifyToken(token)
    if (!identity) {
      console.error('[auth] Token verification FAILED — key mismatch or expired')
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid or expired token' }))
      ws.close()
      return
    }

    connections.set(ws, identity)

    // Send current state grouped by type
    const recordsByType = store.getAllTypes()
    ws.send(JSON.stringify({ type: 'init', identity, recordsByType }))

    // Broadcast presence
    broadcast({ type: 'presence', users: getPresence() })

    console.log(`[ws] ${identity.username} (${identity.role}) connected`)

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString())
        handleMessage(ws, identity, msg)
      } catch (e) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message' }))
      }
    })

    ws.on('close', () => {
      connections.delete(ws)
      broadcast({ type: 'presence', users: getPresence() })
      console.log(`[ws] ${identity.username} disconnected`)
    })

    ws.on('error', () => connections.delete(ws))
  })

  function getPresence() {
    return [...connections.values()].map(u => ({
      userId: u.userId,
      username: u.username,
      role: u.role,
    }))
  }

  function _deny(ws, message) {
    ws.send(JSON.stringify({ type: 'error', message }))
  }

  function _checkActorAccess(identity, actor) {
    if (identity.role === 'dm') return true
    return hasAccess(identity, actor, 'owner')
  }

  function _resolveActorForToken(kind, recordId, changes) {
    if (kind === 'token') {
      const token = store.getById('token', recordId)
      if (token && token.actorId) return store.getById('actor', token.actorId)
      if (!token && changes?.actorId) return store.getById('actor', changes.actorId)
    }
    return null
  }

  function handleMessage(ws, identity, msg) {
    switch (msg.type) {
      case 'create-record': {
        const kind = msg.kind || msg.record.type || 'records'

        // Permission check for item creation (must own the actor)
        if (kind === 'item') {
          const actorId = msg.record.actorId
          if (!actorId) {
            _deny(ws, 'Item requires actorId')
            return
          }
          const actor = store.getById('actor', actorId)
          if (!actor) {
            _deny(ws, 'Actor not found')
            return
          }
          if (!_checkActorAccess(identity, actor)) {
            _deny(ws, 'Permission denied: not the actor owner')
            return
          }
        }

        // Permission check for token creation with actor link
        if (kind === 'token' && msg.record.actorId) {
          const actor = store.getById('actor', msg.record.actorId)
          if (!actor) {
            _deny(ws, 'Actor not found')
            return
          }
          if (!_checkActorAccess(identity, actor)) {
            _deny(ws, 'Permission denied: not the actor owner')
            return
          }
        }

        // Only DM may create actors
        if (kind === 'actor' && identity.role !== 'dm') {
          _deny(ws, 'Permission denied: only DM can create actors')
          return
        }

        // Upsert: if a record with this ID already exists, update instead of inserting a duplicate
        const existing = store.getById(kind, msg.record.id)
        if (existing) {
          const updated = store.update(kind, msg.record.id, {
            ...msg.record,
            id: existing.id,
            createdBy: existing.createdBy,
            createdAt: existing.createdAt,
            updatedBy: identity.userId,
            updatedAt: Date.now(),
          })
          const event = { type: 'record-updated', record: updated, kind, by: identity.username }
          broadcast(event, ws)
          ws.send(JSON.stringify({ type: 'record-updated-ack', record: updated, kind }))
          break
        }

        const record = {
          id: msg.record.id || crypto.randomUUID(),
          ...msg.record,
          createdBy: identity.userId,
          updatedAt: Date.now(),
          createdAt: Date.now(),
        }
        store.insert(kind, record)
        const event = { type: 'record-created', record, kind, by: identity.username }
        broadcast(event, ws)
        ws.send(JSON.stringify({ type: 'record-created-ack', record, kind }))
        break
      }

      case 'update-record': {
        const kind = msg.kind || 'records'
        const existing = store.getById(kind, msg.recordId)
        if (!existing) {
          _deny(ws, 'Record not found')
          return
        }

        // Permission check: actors, items, and actor-linked tokens use ownership model
        let permitted = false

        if (kind === 'actor') {
          permitted = _checkActorAccess(identity, existing)
        } else if (kind === 'item') {
          const actor = existing.actorId ? store.getById('actor', existing.actorId) : null
          permitted = actor ? _checkActorAccess(identity, actor) : (identity.role === 'dm')
        } else if (kind === 'token') {
          const actor = _resolveActorForToken(kind, msg.recordId, msg.changes)
          permitted = actor ? _checkActorAccess(identity, actor) : (existing.createdBy === identity.userId || identity.role === 'dm')
        } else {
          // Fallback to createdBy check for existing record types (wall, template, tile, etc.)
          permitted = !existing.createdBy || existing.createdBy === identity.userId || identity.role === 'dm'
        }

        if (!permitted) {
          _deny(ws, 'Permission denied')
          return
        }

        // For actor updates, prevent non-owners from changing ownership
        if (kind === 'actor' && msg.changes.ownership) {
          const ownerPermitted = identity.role === 'dm' || hasAccess(identity, existing, 'owner')
          if (!ownerPermitted) {
            _deny(ws, 'Permission denied: cannot change ownership')
            return
          }
        }

        const updated = store.update(kind, msg.recordId, {
          ...msg.changes,
          updatedBy: identity.userId,
          updatedAt: Date.now(),
        })
        const event = { type: 'record-updated', record: updated, kind, by: identity.username }
        broadcast(event, ws)
        break
      }

      case 'delete-record': {
        const kind = msg.kind || 'records'
        const existing = store.getById(kind, msg.recordId)
        if (!existing) {
          _deny(ws, 'Record not found')
          return
        }

        let permitted = false

        if (kind === 'actor') {
          permitted = _checkActorAccess(identity, existing)
        } else if (kind === 'item') {
          const actor = existing.actorId ? store.getById('actor', existing.actorId) : null
          permitted = actor ? _checkActorAccess(identity, actor) : (identity.role === 'dm')
        } else if (kind === 'token') {
          const actor = existing.actorId ? store.getById('actor', existing.actorId) : null
          permitted = actor ? _checkActorAccess(identity, actor) : (existing.createdBy === identity.userId || identity.role === 'dm')
        } else {
          permitted = !existing.createdBy || existing.createdBy === identity.userId || identity.role === 'dm'
        }

        if (!permitted) {
          _deny(ws, 'Permission denied')
          return
        }

        const removed = store.remove(kind, msg.recordId)
        if (removed) {
          const event = { type: 'record-deleted', recordId: msg.recordId, kind, by: identity.username }
          broadcast(event)
        }
        break
      }

      case 'ephemeral': {
        const event = { type: 'ephemeral', payload: msg.payload, by: identity.username, userId: identity.userId }
        broadcast(event, ws)
        break
      }

      default:
        _deny(ws, `Unknown message type: ${msg.type}`)
    }
  }

  function broadcast(message, excludeWs) {
    const data = JSON.stringify(message)
    for (const [client] of connections) {
      if (client !== excludeWs && client.readyState === 1) {
        client.send(data)
      }
    }
  }

  // Subscribe to internal events
  eventBus.on('broadcast', (message) => broadcast(message))

  return { wss, getPresence }
}
