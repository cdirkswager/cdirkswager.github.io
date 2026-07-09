import { WebSocketServer } from 'ws'
import crypto from 'node:crypto'
import { hasAccess } from '../../src/vtt/canvas/ownership.js'
import { denyCreate, denyMutate, denyEphemeral, createRateLimiter } from './permissions.js'
import { indexItems, itemExternalWeight, containerCanAccept, wouldCycle } from '../../src/vtt/data/weight.js'
import { slotAcceptsItem } from '../../src/vtt/data/fivee.js'

function actorItems(store, actorId) {
  return store.getAll('item').filter(i => i.actorId === actorId)
}

function collectDescendants(itemId, items) {
  const byParent = new Map()
  for (const it of items) {
    const k = it.parentItemId ?? null
    if (!byParent.has(k)) byParent.set(k, [])
    byParent.get(k).push(it)
  }
  const out = []
  const stack = [itemId]
  while (stack.length) {
    for (const child of byParent.get(stack.pop()) || []) { out.push(child); stack.push(child.id) }
  }
  return out
}

function validateEquipChange(store, actor, existing, changes) {
  if (changes.equipped === true) {
    const targetSlot = changes.equippedSlot ?? existing.equippedSlot ?? existing.slot
    if (!slotAcceptsItem(existing, targetSlot)) return 'Illegal equip slot'
  }
  const attuning = changes.attunement && changes.attunement.attuned === true
  if (attuning && existing.attunement?.required) {
    const max = actor?.attributes?.attunement?.max ?? 3
    const used = actorItems(store, existing.actorId)
      .filter(i => i.id !== existing.id && i.attunement?.attuned).length
    if (used + 1 > max) return 'Attunement limit reached'
  }
  return null
}

function validateContainerMove(store, existing, changes) {
  if (!('parentItemId' in changes)) return null
  const newParent = changes.parentItemId
  if (newParent == null) return null
  const items = actorItems(store, existing.actorId)
  const container = items.find(i => i.id === newParent)
  if (!container || container.itemType !== 'container') return 'Destination is not a container'
  const idx = indexItems(items)
  if (wouldCycle(existing.id, newParent, idx)) return 'Cannot place a container inside itself'
  const incoming = itemExternalWeight(existing, idx)
  const r = containerCanAccept(container, incoming, idx, existing.id)
  if (!r.ok) return r.reason === 'over-capacity' ? 'Container is full' : 'Cannot place item here'
  return null
}

export function createWebSocketHub(server, authVerifier, store, eventBus) {
  const wss = new WebSocketServer({ server })
  const connections = new Map()

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://localhost')
    const token = url.searchParams.get('token')

    /* Liveness probe from the connect panel: the client opens a socket
       with no token purely to confirm the server is reachable, then
       closes it. Not an auth failure — don't log it as one. */
    if (!token) {
      ws.close()
      return
    }

    console.log(`[WS] inbound connection, token present: ${!!token}, tokenLen: ${token?.length ?? 0}`)

    const identity = authVerifier.verifyToken(token)
    if (!identity) {
      console.error('[auth] Token verification FAILED — key mismatch or expired')
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid or expired token' }))
      ws.close()
      return
    }

    connections.set(ws, identity)
    _rateLimiters.set(ws, createRateLimiter())

    const recordsByType = store.getAllTypes()
    ws.send(JSON.stringify({ type: 'init', identity, recordsByType, activeSceneId: _activeSceneId }))

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
      _rateLimiters.delete(ws)
      /* Only forget the scene if no other connection for this user remains. */
      if (![...connections.values()].some(u => u.userId === identity.userId)) {
        _userScenes.delete(identity.userId)
      }
      broadcast({ type: 'presence', users: getPresence() })
      console.log(`[ws] ${identity.username} disconnected`)
    })

    ws.on('error', () => { connections.delete(ws); _rateLimiters.delete(ws) })
  })

  let _activeSceneId = null
  /* The SERVER owns the default scene. On a fresh table it creates one,
     so every client — DM or player, whoever connects first — receives a
     world that already contains a scene. Clients invent nothing. */
  try {
    let persisted = store.getAll('scene')
    if (!persisted.length) {
      store.insert('scene', {
        id: crypto.randomUUID(),
        name: 'Scene 1',
        width: 4000, height: 3000,
        gridType: 'square', gridSize: 100, gridUnit: 5, gridUnitLabel: 'ft',
        backgroundColor: '#2a2a2a',
        lightingEnabled: false, ambientLight: 0,
        createdBy: 'server', createdAt: Date.now(), updatedAt: Date.now(),
      })
      persisted = store.getAll('scene')
    }
    _activeSceneId = persisted[0].id
  } catch {}

  /* Server-authoritative user -> viewed-scene map. Fed by
     scene:user-presence ephemerals and DM scene verbs; exposed to
     clients through the presence roster (sceneId per user). */
  const _userScenes = new Map()
  const _rateLimiters = new Map()

  function getPresence() {
    return [...connections.values()].map(u => ({
      userId: u.userId,
      username: u.username,
      role: u.role,
      sceneId: _userScenes.get(u.userId) ?? _activeSceneId ?? null,
    }))
  }

  function _deny(ws, message, opId) {
    const payload = { type: 'error', message }
    if (opId) payload.opId = opId
    ws.send(JSON.stringify(payload))
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
    const opId = msg.opId || null
    switch (msg.type) {
      case 'create-record': {
        const kind = msg.kind || msg.record.type || 'records'

        const createDenial = denyCreate(kind, msg.record, identity, {
          resolveActor: (id) => store.getById('actor', id),
        })
        if (createDenial) { _deny(ws, createDenial, opId); return }

        /* Item-specific domain validation (capacity) beyond permissions. */
        if (kind === 'item' && msg.record.parentItemId) {
          const items = actorItems(store, msg.record.actorId)
          const container = items.find(i => i.id === msg.record.parentItemId)
          if (!container || container.itemType !== 'container') {
            _deny(ws, 'Destination is not a container', opId)
            return
          }
          const idx = indexItems(items)
          const incoming = itemExternalWeight(msg.record, idx)
          const r = containerCanAccept(container, incoming, idx)
          if (!r.ok) { _deny(ws, 'Container is full', opId); return }
        }

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
        /* First scene becomes the default landing scene for new joiners.
           Previously _activeSceneId was only ever set by a DM broadcast,
           so on a fresh server it stayed null and joiners were stranded
           on their own local default scene. */
        if (kind === 'scene' && !_activeSceneId) {
          _activeSceneId = record.id
        }
        const event = { type: 'record-created', record, kind, by: identity.username }
        broadcast(event, ws)
        ws.send(JSON.stringify({ type: 'record-created-ack', record, kind }))
        break
      }

      case 'update-record': {
        const kind = msg.kind || 'records'
        const existing = store.getById(kind, msg.recordId)
        if (!existing) {
          _deny(ws, 'Record not found', opId)
          return
        }

        const mutateDenial = denyMutate(kind, existing, identity, {
          resolveActor: (id) => store.getById('actor', id),
          resolveTokenActor: () => _resolveActorForToken(kind, msg.recordId, msg.changes),
        })
        if (mutateDenial) { _deny(ws, mutateDenial, opId); return }

        if (kind === 'item') {
          const actor = existing.actorId ? store.getById('actor', existing.actorId) : null
          const equipErr = validateEquipChange(store, actor, existing, msg.changes)
          if (equipErr) { _deny(ws, equipErr, opId); return }
          const moveErr = validateContainerMove(store, existing, msg.changes)
          if (moveErr) { _deny(ws, moveErr, opId); return }
        }

        if (kind === 'actor' && msg.changes.ownership) {
          const ownerPermitted = identity.role === 'dm' || hasAccess(identity, existing, 'owner')
          if (!ownerPermitted) {
            _deny(ws, 'Permission denied: cannot change ownership', opId)
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
          _deny(ws, 'Record not found', opId)
          return
        }

        const deleteDenial = denyMutate(kind, existing, identity, {
          resolveActor: (id) => store.getById('actor', id),
        })
        if (deleteDenial) { _deny(ws, deleteDenial, opId); return }

        if (kind === 'item' && existing.itemType === 'container' && existing.container) {
          const allItems = store.getAll('item')
          const descendants = collectDescendants(existing.id, allItems)
          for (const d of descendants) {
            store.remove('item', d.id)
            broadcast({ type: 'record-deleted', recordId: d.id, kind: 'item', by: identity.username })
          }
        }

        if (kind === 'actor') {
          for (const it of store.getAll('item').filter(i => i.actorId === msg.recordId)) {
            if (store.remove('item', it.id)) {
              broadcast({ type: 'record-deleted', recordId: it.id, kind: 'item', by: identity.username })
            }
          }
          for (const tk of store.getAll('token').filter(t => t.actorId === msg.recordId)) {
            if (store.remove('token', tk.id)) {
              broadcast({ type: 'record-deleted', recordId: tk.id, kind: 'token', by: identity.username })
            }
          }
        }

        const removed = store.remove(kind, msg.recordId)
        if (removed) {
          const event = { type: 'record-deleted', recordId: msg.recordId, kind, by: identity.username }
          broadcast(event)
        }
        break
      }

      case 'transfer-item': {
        const itemId = msg.itemId
        const toActorId = msg.toActorId
        const toParentItemId = msg.toParentItemId ?? null
        const opId = msg.opId
        const item = store.getById('item', itemId)
        if (!item) { _deny(ws, 'Item not found', opId); return }

        const sourceActor = item.actorId ? store.getById('actor', item.actorId) : null
        const canPull = identity.role === 'dm' || (sourceActor && hasAccess(identity, sourceActor, 'owner'))
        if (!canPull) { _deny(ws, 'Permission denied: cannot take from source actor', opId); return }

        const destActor = store.getById('actor', toActorId)
        if (!destActor) { _deny(ws, 'Destination actor not found', opId); return }
        const canPush = identity.role === 'dm' || hasAccess(identity, destActor, 'owner')
        if (!canPush) { _deny(ws, 'Permission denied: cannot place into destination actor', opId); return }

        const moveQty = msg.quantity == null ? item.quantity : Math.max(0, Math.min(msg.quantity, item.quantity))
        if (moveQty <= 0) { _deny(ws, 'Invalid quantity', opId); return }
        const isPartial = !!item.stackable && moveQty < item.quantity

        const srcItems = actorItems(store, item.actorId)
        const srcIdx = indexItems(srcItems)
        const incoming = isPartial ? (Number(item.weight) || 0) * moveQty : itemExternalWeight(item, srcIdx)

        if (toParentItemId) {
          const destItems = actorItems(store, toActorId)
          const container = destItems.find(i => i.id === toParentItemId)
          if (!container || container.itemType !== 'container') { _deny(ws, 'Destination is not a container', opId); return }
          if (wouldCycle(item.id, toParentItemId, indexItems([...srcItems, ...destItems]))) {
            _deny(ws, 'Cannot place a container inside itself', opId); return
          }
          const r = containerCanAccept(container, incoming, indexItems(destItems), itemId)
          if (!r.ok) { _deny(ws, 'Container is full', opId); return }
        }

        const now = Date.now()
        if (isPartial) {
          const source = store.update('item', itemId, { quantity: item.quantity - moveQty, updatedBy: identity.userId, updatedAt: now })
          const moved = {
            ...item,
            id: crypto.randomUUID(),
            actorId: toActorId,
            parentItemId: toParentItemId,
            quantity: moveQty,
            equipped: false,
            equippedSlot: null,
            attunement: item.attunement ? { ...item.attunement, attuned: false } : item.attunement,
            createdBy: identity.userId, createdAt: now, updatedAt: now,
          }
          store.insert('item', moved)
          broadcast({ type: 'record-updated', record: source, kind: 'item', by: identity.username })
          broadcast({ type: 'record-created', record: moved, kind: 'item', by: identity.username })
          ws.send(JSON.stringify({ type: 'transfer-item-ack', kind: 'item', source, moved }))
        } else {
          const descendants = collectDescendants(itemId, srcItems)
          const moved = store.update('item', itemId, {
            actorId: toActorId,
            parentItemId: toParentItemId,
            equipped: false,
            equippedSlot: null,
            attunement: item.attunement ? { ...item.attunement, attuned: false } : item.attunement,
            updatedBy: identity.userId, updatedAt: now,
          })
          broadcast({ type: 'record-updated', record: moved, kind: 'item', by: identity.username })
          for (const d of descendants) {
            const du = store.update('item', d.id, { actorId: toActorId, updatedBy: identity.userId, updatedAt: now })
            broadcast({ type: 'record-updated', record: du, kind: 'item', by: identity.username })
          }
          ws.send(JSON.stringify({ type: 'transfer-item-ack', kind: 'item', moved }))
        }
        break
      }

      case 'split-stack': {
        const itemId = msg.itemId
        const quantity = msg.quantity
        const item = store.getById('item', itemId)
        if (!item) { _deny(ws, 'Item not found', opId); return }
        if (!item.stackable) { _deny(ws, 'Item is not stackable', opId); return }
        if (quantity <= 0 || quantity >= item.quantity) { _deny(ws, 'Invalid split quantity', opId); return }

        const actor = item.actorId ? store.getById('actor', item.actorId) : null
        if (!actor) { _deny(ws, 'Actor not found', opId); return }
        if (!_checkActorAccess(identity, actor)) { _deny(ws, 'Permission denied', opId); return }

        const now = Date.now()
        const source = store.update('item', itemId, { quantity: item.quantity - quantity, updatedBy: identity.userId, updatedAt: now })
        const split = {
          ...item,
          id: crypto.randomUUID(),
          quantity,
          createdBy: identity.userId, createdAt: now, updatedAt: now,
        }
        store.insert('item', split)
        broadcast({ type: 'record-updated', record: source, kind: 'item', by: identity.username })
        broadcast({ type: 'record-created', record: split, kind: 'item', by: identity.username })
        ws.send(JSON.stringify({ type: 'split-stack-ack', kind: 'item', source, split }))
        break
      }

      case 'create-loot-pile': {
        const x = Number(msg.x) || 0
        const y = Number(msg.y) || 0
        const now = Date.now()

        let seed = null
        if (msg.fromItemId) {
          seed = store.getById('item', msg.fromItemId)
          if (!seed) { _deny(ws, 'Item not found', opId); return }
          const src = seed.actorId ? store.getById('actor', seed.actorId) : null
          const canPull = identity.role === 'dm' || (src && hasAccess(identity, src, 'owner'))
          if (!canPull) { _deny(ws, 'Permission denied: cannot drop this item', opId); return }
        }

        const pileId = crypto.randomUUID()
        const pile = store.insert('actor', {
          type: 'actor', id: pileId, name: msg.name || 'Loot',
          actorType: 'loot-pile', ownership: { default: 'owner', users: {} },
          attributes: { schema: 1, currency: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 } },
          createdBy: identity.userId, createdAt: now, updatedAt: now,
        })
        const iconType = seed && seed.itemType === 'currency' ? 'coins' : 'chest'
        const tokenId = crypto.randomUUID()
        const token = store.insert('token', {
          type: 'token', id: tokenId, actorId: pileId, name: pile.name,
          x, y, width: msg.width || 70, height: msg.height || 70,
          src: msg.tokenSrc || '', iconType,
          createdBy: identity.userId, createdAt: now, updatedAt: now,
        })
        broadcast({ type: 'record-created', record: pile, kind: 'actor', by: identity.username })
        broadcast({ type: 'record-created', record: token, kind: 'token', by: identity.username })

        if (seed) {
          const moveQty = msg.quantity == null ? seed.quantity : Math.max(1, Math.min(msg.quantity, seed.quantity))
          const isPartial = !!seed.stackable && moveQty < seed.quantity
          if (isPartial) {
            const source = store.update('item', seed.id, { quantity: seed.quantity - moveQty, updatedBy: identity.userId, updatedAt: now })
            const moved = { ...seed, id: crypto.randomUUID(), actorId: pileId, parentItemId: null, quantity: moveQty,
              equipped: false, equippedSlot: null,
              attunement: seed.attunement ? { ...seed.attunement, attuned: false } : seed.attunement,
              createdBy: identity.userId, createdAt: now, updatedAt: now }
            store.insert('item', moved)
            broadcast({ type: 'record-updated', record: source, kind: 'item', by: identity.username })
            broadcast({ type: 'record-created', record: moved, kind: 'item', by: identity.username })
          } else {
            const moved = store.update('item', seed.id, { actorId: pileId, parentItemId: null,
              equipped: false, equippedSlot: null,
              attunement: seed.attunement ? { ...seed.attunement, attuned: false } : seed.attunement,
              updatedBy: identity.userId, updatedAt: now })
            broadcast({ type: 'record-updated', record: moved, kind: 'item', by: identity.username })
          }
        }

        ws.send(JSON.stringify({ type: 'create-loot-pile-ack', pileId, tokenId }))
        break
      }

      case 'ephemeral': {
        const limiter = _rateLimiters.get(ws)
        if (limiter && !limiter.allow()) return   // silent drop under flood

        const rawSize = Buffer.byteLength(JSON.stringify(msg.payload ?? ''))
        const denial = denyEphemeral(msg.payload, identity, rawSize)
        if (denial) { _deny(ws, denial, opId); return }

        /* Server-side user->scene bookkeeping. */
        let presenceChanged = false
        if (msg.payload.type === 'scene:user-presence') {
          /* A client may only announce ITSELF, whatever the payload claims. */
          if (msg.payload.sceneId) {
            msg.payload = { ...msg.payload, userId: identity.userId }
            if (_userScenes.get(identity.userId) !== msg.payload.sceneId) {
              _userScenes.set(identity.userId, msg.payload.sceneId)
              presenceChanged = true
            }
          }
        }
        if (msg.payload.type === 'scene:switched' && msg.payload.sceneId) {
          /* DM activation (denyEphemeral already enforced dmOnly). */
          _activeSceneId = msg.payload.sceneId
          for (const u of connections.values()) _userScenes.set(u.userId, msg.payload.sceneId)
          presenceChanged = true
        }
        if (msg.payload.type === 'scene:move-all-users' && msg.payload.sceneId) {
          for (const u of connections.values()) _userScenes.set(u.userId, msg.payload.sceneId)
          presenceChanged = true
        }

        const event = { type: 'ephemeral', payload: msg.payload, by: identity.username, userId: identity.userId }
        broadcast(event, ws)
        if (presenceChanged) broadcast({ type: 'presence', users: getPresence() })
        break
      }

      default:
        _deny(ws, `Unknown message type: ${msg.type}`, opId)
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

  eventBus.on('broadcast', (message) => broadcast(message))

  return { wss, getPresence }
}