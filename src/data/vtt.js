import { getVttToken } from './auth'
import api, { get, post } from './api'

const DEFAULT_SERVER_URL = 'ws://localhost:3001'

export async function getVttGameToken() {
  const data = await post('/auth/vtt-token')
  return data.ok ? data.token : null
}

export async function lookupServer(joinCode) {
  const data = await get('/game/lookup/' + joinCode.toUpperCase())
  if (!data.ok || !data.serverUrl) return null
  return data.serverUrl
}

export async function registerServer(serverUrl) {
  const data = await post('/game/register', { serverUrl })
  if (!data.ok || !data.code) return null
  return { code: data.code, serverUrl: data.serverUrl }
}

export class VttConnector {
  constructor({ eventBus, getToken, serverUrl }) {
    this.eventBus = eventBus
    this.getToken = getToken
    this.serverUrl = serverUrl
    this.syncClient = null
    this.connectionState = 'disconnected'
    this._onStateChange = null
  }

  setOnStateChange(fn) {
    this._onStateChange = fn
  }

  async connect() {
    const token = await this.getToken()
    if (!token) {
      this._setState('error', 'No VTT token available')
      return false
    }

    let url = this.serverUrl || DEFAULT_SERVER_URL
    if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
      url = 'ws://' + url
    }

    try {
      // Import dynamically to avoid bundling in non-VTT paths
      const mod = await import('../vtt/canvas/VttSyncClient.js')
      this.syncClient = new mod.VttSyncClient({
        eventBus: this.eventBus,
        getToken: () => token,
        url: url,
      })

      // Start the WebSocket connection
      this.syncClient.connect()

      // Poll for connected state (VttSyncClient doesn't emit events)
      return await new Promise((resolve) => {
        let done = false
        const timeout = setTimeout(() => {
          if (!done) {
            done = true
            this._setState('error', 'Connection timed out')
            resolve(false)
          }
        }, 10000)

        const poll = setInterval(() => {
          if (done) return
          const ws = this.syncClient?.ws
          if (!ws) return // not connected yet

          if (ws.readyState === WebSocket.OPEN) {
            clearInterval(poll)
            done = true
            clearTimeout(timeout)
            this._setState('connected')
            resolve(true)
          } else if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
            // Connection failed or was closed
            clearInterval(poll)
            done = true
            clearTimeout(timeout)
            this._setState('error', 'Connection refused')
            resolve(false)
          }
        }, 200)

        // Also check immediately in case it's already open (unlikely but safe)
        poll()
      })
    } catch (e) {
      this._setState('error', e.message || 'Connection failed')
      return false
    }
  }

  _setState(state, message) {
    this.connectionState = state
    if (this._onStateChange) {
      this._onStateChange({ state: state, message })
    }
  }

  disconnect() {
    if (this.syncClient) {
      this.syncClient.disconnect()
      this.syncClient = null
    }
    this._setState('disconnected')
  }

  get state() {
    return this.connectionState
  }
}

export async function connectVtt(eventBus, serverUrl) {
  const token = await getVttGameToken()
  if (!token) return { ok: false, error: 'Failed to get VTT token' }

  let wsUrl = serverUrl || DEFAULT_SERVER_URL
  if (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://')) {
    wsUrl = 'ws://' + wsUrl
  }

  const { VttSyncClient } = await import('../vtt/canvas/VttSyncClient.js')
  const syncClient = new VttSyncClient({ eventBus, getToken: () => token, url: wsUrl })
  return { ok: true, syncClient }
}
