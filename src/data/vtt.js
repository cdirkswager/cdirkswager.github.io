import { post } from './api'

const DEFAULT_SERVER_URL = 'ws://localhost:3001'

export function getServerUrl() {
  let url
  try { url = import.meta.env.VITE_VTT_SERVER_URL } catch {}
  return normalizeWsUrl(url || DEFAULT_SERVER_URL)
}

export function normalizeWsUrl(input) {
  const url = (input || '').trim() || DEFAULT_SERVER_URL
  if (url.startsWith('ws://') || url.startsWith('wss://')) return url
  return 'ws://' + url
}

function httpOriginOf(wsUrl) {
  return normalizeWsUrl(wsUrl).replace(/^ws/, 'http')
}

export async function getVttGameToken() {
  const data = await post('/auth/vtt-token')
  return data.ok ? data.token : null
}

export async function pingServer(wsUrl = getServerUrl()) {
  const origin = httpOriginOf(wsUrl)
  try {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 3000)
    const res = await fetch(origin + '/api/health', { signal: controller.signal })
    clearTimeout(t)
    if (!res.ok) return false
    const data = await res.json().catch(() => null)
    return !!(data && data.ok)
  } catch {
    return false
  }
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

    const url = normalizeWsUrl(this.serverUrl || getServerUrl())

    try {
      const mod = await import('../vtt/canvas/VttSyncClient.js')

      return await new Promise((resolve) => {
        let done = false
        const finish = (ok) => {
          if (done) return
          done = true
          clearTimeout(timeout)
          resolve(ok)
        }
        const timeout = setTimeout(() => {
          this._setState('error', 'Connection timed out')
          finish(false)
        }, 15000)

        this.syncClient = new mod.VttSyncClient({
          eventBus: this.eventBus,
          getToken: this.getToken,
          url: url,
          onAuthenticated: () => {
            this._setState('connected')
            finish(true)
          },
          onAuthError: (message) => {
            this._setState('error', message || 'Authentication failed')
            finish(false)
          },
        })

        this.syncClient.connect()
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
