import { WebSocketServer } from 'ws'
import crypto from 'node:crypto'

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

  function handleMessage(ws, identity, msg) {
    switch (msg.type) {
      case 'create-record': {
        const record = {
          id: msg.record.id || crypto.randomUUID(),
          ...msg.record,
          createdBy: identity.userId,
          updatedAt: Date.now(),
          createdAt: Date.now(),
        }
        const kind = record.type || 'records'
        store.insert(kind, record)
        const event = { type: 'record-created', record, by: identity.username }
        broadcast(event, ws)
        ws.send(JSON.stringify({ type: 'record-created-ack', record, kind }))
        break
      }

      case 'update-record': {
        const kind = msg.kind || 'records'
        const existing = store.getById(kind, msg.recordId)
        if (!existing) {
          ws.send(JSON.stringify({ type: 'error', message: 'Record not found' }))
          return
        }
        if (existing.createdBy && existing.createdBy !== identity.userId && identity.role !== 'gm' && identity.role !== 'dm') {
          ws.send(JSON.stringify({ type: 'error', message: 'Permission denied: not the owner' }))
          return
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
          ws.send(JSON.stringify({ type: 'error', message: 'Record not found' }))
          return
        }
        if (existing.createdBy && existing.createdBy !== identity.userId && identity.role !== 'gm' && identity.role !== 'dm') {
          ws.send(JSON.stringify({ type: 'error', message: 'Permission denied: not the owner' }))
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
        ws.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${msg.type}` }))
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
