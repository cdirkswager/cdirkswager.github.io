import { post } from './api'

/**
 * Single-session VTT: there is exactly one game server and one shared
 * canvas. The server URL is a constant (overridable at build time via
 * VITE_VTT_SERVER_URL, or per-connect via the optional field on the
 * connect panel), so no join-code / lookup indirection is needed —
 * players just connect to the known server once it's running.
 */
const DEFAULT_SERVER_URL = 'ws://localhost:3001'

/** The configured WebSocket URL for the game server. */
export function getServerUrl() {
  let url
  try { url = import.meta.env.VITE_VTT_SERVER_URL } catch {}
  return normalizeWsUrl(url || DEFAULT_SERVER_URL)
}

/** Accepts 'host:port', 'ws://…', or 'wss://…' and returns a ws(s):// URL. */
export function normalizeWsUrl(input) {
  const url = (input || '').trim() || DEFAULT_SERVER_URL
  if (url.startsWith('ws://') || url.startsWith('wss://')) return url
  return 'ws://' + url
}

export async function getVttGameToken() {
  const data = await post('/auth/vtt-token')
  return data.ok ? data.token : null
}

/**
 * Detect whether the game server is running.
 *
 * This deliberately probes over WebSocket rather than fetching
 * /api/health. A plain HTTP fetch from the deployed HTTPS site to a
 * loopback address is blocked twice over: by CORS (the local server
 * sends no Access-Control-Allow-Origin) and by the browser's Local
 * Network Access / Private Network Access gate, which auto-denies
 * public-site -> localhost requests.
 *
 * WebSockets are subject to neither: they bypass CORS entirely, and
 * loopback origins are exempt from mixed-content blocking. Since the
 * VTT's real connection is a WebSocket to this same URL, a successful
 * handshake here is a strictly accurate predictor that connecting will
 * work — detection can never be blocked while the real connection would
 * have succeeded.
 *
 * The server completes the upgrade before validating the token, so the
 * socket opens even though this probe sends no credentials; it is closed
 * immediately after.
 */
export function pingServer(wsUrl = getServerUrl(), timeoutMs = 2500) {
  const url = normalizeWsUrl(wsUrl)
  return new Promise((resolve) => {
    let settled = false
    let ws = null

    const done = (alive) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try { ws?.close() } catch {}
      resolve(alive)
    }

    const timer = setTimeout(() => done(false), timeoutMs)

    try {
      ws = new WebSocket(url + '?probe=1')
    } catch {
      done(false)
      return
    }

    ws.onopen = () => done(true)
    ws.onerror = () => done(false)
    /* A close that arrives before open means we never reached the server. */
    ws.onclose = () => done(false)
  })
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
      // Import dynamically to avoid bundling in non-VTT paths
      const mod = await import('../vtt/canvas/VttSyncClient.js')

      // Resolve directly from the auth callbacks — no state polling.
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

        // Pass this.getToken through directly so VttSyncClient fetches a fresh token on every connect/reconnect
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

        // Start the WebSocket connection — VttSyncClient calls getToken() fresh each time
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
