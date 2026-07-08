export class VttSyncClient {
  constructor({ eventBus, getToken, url, onAuthenticated, onAuthError }) {
    if (!eventBus || !getToken || !url) throw new Error('VttSyncClient requires eventBus, getToken, and url')
    this.eventBus = eventBus
    this.getToken = getToken
    this.url = url
    this.onAuthenticated = onAuthenticated
    this.onAuthError = onAuthError
    this.ws = null
    this.reconnectDelay = 2000
    this._destroyed = false
    this._unsubs = []
    this._authenticated = false
    this._authFailed = false
    this._reconnectAttempts = 0
    this._maxReconnectAttempts = 30
    this._maxReconnectDelay = 30000
    this._initRecords = null
    this._lastPresence = null
  }

  async connect() {
    if (this._destroyed) return

    // Always fetch a fresh token immediately before connecting — never reuse stale tokens
    let token
    try {
      const result = this.getToken()
      token = await (result && typeof result.then === 'function' ? result : Promise.resolve(result))
    } catch (e) {
      console.error('[VttSyncClient] getToken() threw:', e.message)
      setTimeout(() => this.connect(), 2000)
      return
    }

    const tokenLen = token?.length ?? 0
    console.log(`[VttSyncClient] connecting to ${this.url}, tokenLen=${tokenLen}`)

    // Validate: a JWT must have exactly 3 dot-separated parts
    if (token && token.split('.').length !== 3) {
      console.error('[VttSyncClient] Invalid token format — expected 3 parts, got', token.split('.').length, '— aborting connect')
      this._authFailed = true
      if (this.onAuthError) this.onAuthError('Invalid token format')
      return
    }

    if (!token) {
      console.warn('[VttSyncClient] No token available, retrying in 2s')
      setTimeout(() => this.connect(), 2000)
      return
    }

    // Clean up any previous WebSocket before creating a new one
    if (this.ws) {
      this._cleanupWs()
    }

    this.ws = new WebSocket(`${this.url}?token=${token}`)
    this._subscribe()
    this.ws.onopen = () => {
      console.log('[VttSyncClient] Transport open — waiting for auth')
    }
    this.ws.onmessage = (e) => {
      try { this._onMessage(JSON.parse(e.data)) } catch (err) {
        console.warn('[VttSyncClient] Invalid message', err)
      }
    }
    this.ws.onclose = () => {
      if (this._destroyed || this._authFailed) return

      // If we were authenticated and now disconnected, try to reconnect
      if (this._authenticated) {
        console.log('[VttSyncClient] Authenticated disconnect — reconnecting...')
        this._authenticated = false
        this._scheduleReconnect()
      } else {
        console.log('[VttSyncClient] Pre-auth disconnect — retrying...')
        setTimeout(() => this.connect(), 2000)
      }
    }
    this.ws.onerror = () => {}
  }

  _cleanupWs() {
    if (!this.ws) return
    try { this.ws.onclose = null } catch {}
    try { this.ws.onerror = null } catch {}
    try { this.ws.close() } catch {}
    this.ws = null
  }

  _scheduleReconnect() {
    const attempts = ++this._reconnectAttempts
    if (attempts > this._maxReconnectAttempts) {
      console.error('[VttSyncClient] Max reconnect attempts reached')
      if (this.onAuthError) this.onAuthError('Max reconnect attempts reached')
      return
    }

    // Exponential backoff: 2s, 4s, 8s, ... capped at _maxReconnectDelay
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, attempts - 1),
      this._maxReconnectDelay
    )
    console.log(`[VttSyncClient] Reconnecting in ${delay}ms (attempt ${attempts}/${this._maxReconnectAttempts})`)
    setTimeout(() => {
      if (!this._destroyed) this.connect()
    }, delay)
  }

  _subscribe() {
    this._unsubs.push(
      this.eventBus.on('record:changed', (e) => this._onRecordChanged(e))
    )
    this._unsubs.push(
      this.eventBus.on('ephemeral', (e) => this._onEphemeral(e))
    )
    this._unsubs.push(
      this.eventBus.on('sync-bridge:ready', () => this.replayInitRecords())
    )
    /* Raw server verbs (e.g. create-loot-pile) that are not record CRUD. */
    this._unsubs.push(
      this.eventBus.on('net:send', (msg) => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify(msg))
        }
      })
    )
  }

  replayInitRecords() {
    /* Re-emit the latest presence so late-mounting UI catches up. */
    if (this._lastPresence) {
      this.eventBus.emit('presence', { users: this._lastPresence })
    }
    if (!this._initRecords) return
    for (const [type, recs] of Object.entries(this._initRecords)) {
      for (const record of recs) {
        this.eventBus.emitRecord(type, 'created', record, undefined, 'remote')
      }
    }
    if (this._initActiveSceneId) {
      this.eventBus.emit('scene:init-active', { sceneId: this._initActiveSceneId })
      this._initActiveSceneId = null
    }
  }

  _unsubscribe() {
    for (const unsub of this._unsubs) unsub()
    this._unsubs = []
  }

  _onMessage(msg) {
    switch (msg.type) {
      case 'init':
        // Real auth success — transport open is NOT enough; init means server verified our token
        this._authenticated = true
        this._reconnectAttempts = 0
        this._authFailed = false

        // Store records for replay; the sync bridge may not be ready yet
        this._initRecords = msg.recordsByType || {}
        this._initActiveSceneId = msg.activeSceneId ?? null

        if (this.onAuthenticated) this.onAuthenticated()
        break

      case 'record-created':
        this.eventBus.emitRecord(msg.kind ?? msg.record.type, 'created', msg.record, undefined, 'remote')
        break

      case 'record-updated':
        this.eventBus.emitRecord(msg.kind ?? msg.record.type, 'updated', msg.record, undefined, 'remote')
        break

      case 'record-deleted':
        this.eventBus.emitRecord(msg.kind, 'deleted', { id: msg.recordId }, undefined, 'remote')
        break

      case 'ephemeral':
        /* Re-emitted with origin 'remote' so _onEphemeral never sends it
           back to the server (the echo-loop bug class). fromUserId lets
           display layers attribute the message. */
        this.eventBus.emitEphemeral(msg.payload.type, { ...msg.payload, fromUserId: msg.userId, fromUsername: msg.by }, 'remote')
        break

      case 'presence':
        /* Server pushes the authoritative connected-user list on every
           connect/disconnect. Surface it on the bus for the UI, and cache
           it — the first push often arrives before UI subscribers mount. */
        this._lastPresence = msg.users ?? []
        this.eventBus.emit('presence', { users: this._lastPresence })
        break

      case 'record-created-ack':
      case 'record-updated-ack':
      case 'transfer-item-ack':
        break

      case 'sync-error':
        this.eventBus.emit('sync-error', msg)
        break

      case 'error':
        if (msg.opId) {
          this.eventBus.emit('sync-error', msg)
        } else {
          // Auth failure — do NOT reconnect; surface the error
          console.error('[VttSyncClient] Server error:', msg.message)
          this._authFailed = true
          if (this.onAuthError) this.onAuthError(msg.message)
        }
        break
    }
  }

  _onRecordChanged(e) {
    if (e.origin === 'remote') return
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    const msg = { resource: e.resource, action: e.action, data: e.data }
    switch (e.action) {
      case 'created':
        this.ws.send(JSON.stringify({ type: 'create-record', kind: e.resource, record: { ...e.data }, opId: e.opId }))
        break

      case 'updated':
        this.ws.send(JSON.stringify({ type: 'update-record', kind: e.resource, recordId: e.data.id, changes: e.data, opId: e.opId }))
        break

      case 'deleted':
        this.ws.send(JSON.stringify({ type: 'delete-record', kind: e.resource, recordId: e.data.id, opId: e.opId }))
        break

      case 'transfer':
        this.ws.send(JSON.stringify({
          type: 'transfer-item',
          itemId: e.data.itemId,
          toActorId: e.data.toActorId,
          toParentItemId: e.data.toParentItemId ?? null,
          quantity: e.data.quantity ?? null,
          opId: e.opId,
        }))
        break
    }
  }

  _onEphemeral(e) {
    /* Never re-broadcast ephemerals that arrived from the network.
       origin is the contract; fromUserId is defense in depth. */
    if (e.origin === 'remote' || e.fromUserId) return
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const { origin, ...payload } = e
      this.ws.send(JSON.stringify({ type: 'ephemeral', payload }))
    }
  }

  disconnect() {
    this._destroyed = true
    this._authFailed = false
    this._authenticated = false
    this._unsubscribe()
    this._cleanupWs()
  }
}
