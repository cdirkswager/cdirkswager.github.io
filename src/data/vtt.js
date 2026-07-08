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
  return { code: data.code, serverUrl: serverUrl }
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

      // Pass this.getToken through directly so VttSyncClient fetches a fresh token on every connect/reconnect
      this.syncClient = new mod.VttSyncClient({
        eventBus: this.eventBus,
        getToken: this.getToken,
        url: url,
        onAuthenticated: () => {
          this._setState('connected')
        },
        onAuthError: (message) => {
          this._setState('error', message || 'Authentication failed')
        },
      })

      // Start the WebSocket connection — VttSyncClient calls getToken() fresh each time
      this.syncClient.connect()

      // Wait for real auth success or failure via callbacks, with a timeout
      return await new Promise((resolve) => {
        let done = false
        const timeout = setTimeout(() => {
          if (!done) {
            done = true
            this._setState('error', 'Connection timed out')
            resolve(false)
          }
        }, 15000)

        // Poll for state changes — the callbacks set connectionState which we check here
        const poll = setInterval(() => {
          if (done) return
          if (this.connectionState === 'connected') {
            clearInterval(poll)
            done = true
            clearTimeout(timeout)
            resolve(true)
          } else if (this.connectionState === 'error') {
            clearInterval(poll)
            done = true
            clearTimeout(timeout)
            resolve(false)
          }
        }, 200)

        // Also check immediately in case it's already resolved
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
