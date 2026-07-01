export class VttSyncClient {
  constructor({ eventBus, getToken, url }) {
    if (!eventBus || !getToken || !url) throw new Error('VttSyncClient requires eventBus, getToken, and url')
    this.eventBus = eventBus
    this.getToken = getToken
    this.url = url
    this.ws = null
    this.reconnectDelay = 2000
    this._sending = false
    this._destroyed = false
    this._unsubs = []
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
      setTimeout(() => this.connect(), 2000)
      return
    }

    if (!token) {
      console.warn('[VttSyncClient] No token available, retrying in 2s')
      setTimeout(() => this.connect(), 2000)
      return
    }
    this.ws = new WebSocket(`${this.url}?token=${token}`)
    this.ws.onopen = () => {
      console.log('[VttSyncClient] Connected')
      this._subscribe()
    }
    this.ws.onmessage = (e) => {
      try { this._onMessage(JSON.parse(e.data)) } catch (err) {
        console.warn('[VttSyncClient] Invalid message', err)
      }
    }
    this.ws.onclose = () => {
      console.log('[VttSyncClient] Disconnected, reconnecting...')
      this._unsubscribe()
      if (!this._destroyed) setTimeout(() => this.connect(), this.reconnectDelay)
    }
    this.ws.onerror = () => {}
  }

  _subscribe() {
    this._unsubs.push(
      this.eventBus.on('record:changed', (e) => this._onRecordChanged(e))
    )
    this._unsubs.push(
      this.eventBus.on('ephemeral', (e) => this._onEphemeral(e))
    )
  }

  _unsubscribe() {
    for (const unsub of this._unsubs) unsub()
    this._unsubs = []
  }

  _onMessage(msg) {
    switch (msg.type) {
      case 'init':
        this._sending = true
        for (const [type, records] of Object.entries(msg.recordsByType || {})) {
          for (const record of records) {
            this.eventBus.emitRecord(type, 'created', record)
          }
        }
        this._sending = false
        break
      case 'record-created':
        this._sending = true
        this.eventBus.emitRecord(msg.record.type, 'created', msg.record)
        this._sending = false
        break
      case 'record-updated':
        this._sending = true
        this.eventBus.emitRecord(msg.record.type, 'updated', msg.record)
        this._sending = false
        break
      case 'record-deleted':
        this._sending = true
        this.eventBus.emitRecord(msg.kind, 'deleted', { id: msg.recordId })
        this._sending = false
        break
      case 'ephemeral':
        this.eventBus.emitEphemeral(msg.payload.type, { ...msg.payload, fromUserId: msg.userId, fromUsername: msg.by })
        break
      case 'record-created-ack':
      case 'record-updated-ack':
        break
      case 'error':
        console.error('[VttSyncClient] Server error:', msg.message)
        break
    }
  }

  _onRecordChanged(e) {
    if (this._sending || !this.ws || this.ws.readyState !== WebSocket.OPEN) return
    const msg = { resource: e.resource, action: e.action, data: e.data }
    switch (e.action) {
      case 'created':
        this.ws.send(JSON.stringify({ type: 'create-record', record: { ...e.data, type: e.resource } }))
        break
      case 'updated':
        this.ws.send(JSON.stringify({ type: 'update-record', kind: e.resource, recordId: e.data.id, changes: e.data }))
        break
      case 'deleted':
        this.ws.send(JSON.stringify({ type: 'delete-record', kind: e.resource, recordId: e.data.id }))
        break
    }
  }

  _onEphemeral(e) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'ephemeral', payload: e }))
    }
  }

  disconnect() {
    this._destroyed = true
    this._unsubscribe()
    if (this.ws) {
      this.ws.onclose = null
      this.ws.close()
      this.ws = null
    }
  }
}
