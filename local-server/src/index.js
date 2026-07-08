import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { extname, join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig } from './config.js'
import { createEventBus } from './event-bus.js'
import { createStore } from './key-store.js'
import { createAuthVerifier } from './auth.js'
import { createWebSocketHub } from './websocket.js'
import { createFileStore } from './file-store.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const config = loadConfig()

// --- Keystone modules ---
const eventBus = createEventBus()
const store = createStore(config.dataDir)
const authVerifier = createAuthVerifier(config)
const fileStore = createFileStore(config.dataDir)

// --- HTTP server ---
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${config.port}`)
  const path = url.pathname

  // API routes
  if (path === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, uptime: process.uptime() }))
    return
  }

  if (path === '/api/presence') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, users: wsHub.getPresence() }))
    return
  }

  if (path === '/api/records' && req.method === 'GET') {
    const recordsByType = store.getAllTypes()
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, recordsByType }))
    return
  }

  // File serving
  if (path.startsWith('/files/')) {
    const storedName = path.slice(7)
    const file = fileStore.get(storedName)
    if (!file) {
      res.writeHead(404)
      res.end('Not found')
      return
    }
    res.writeHead(200, { 'Content-Type': file.mime })
    res.end(file.buffer)
    return
  }

  // Serve static client from public/
  let filePath = join(__dirname, '..', 'public', path === '/' ? 'index.html' : path)
  if (!existsSync(filePath)) {
    filePath = join(__dirname, '..', 'public', 'index.html')
  }
  try {
    const content = readFileSync(filePath)
    const ext = extname(filePath)
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
    res.end(content)
  } catch {
    res.writeHead(404)
    res.end('Not found')
  }
})

// --- WebSocket hub ---
const wsHub = createWebSocketHub(server, authVerifier, store, eventBus)

// --- Start ---
async function registerWithCloudflare(config) {
  const token = config.authToken
  const serverUrl = config.serverUrl
  if (!token || !serverUrl) return null

  try {
    const res = await fetch(`${config.siteBaseUrl}/api/game/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Session-Token': token },
      body: JSON.stringify({ serverUrl }),
    })
    const data = await res.json()
    if (data.ok) {
      console.log(`[discovery] Registered! Join code: ${data.code}  (expires in 2h)`)
      return data.code
    } else {
      console.warn(`[discovery] Registration failed: ${data.error}`)
    }
  } catch (e) {
    console.warn(`[discovery] Could not register: ${e.message}`)
  }
  return null
}

// --- Start ---
async function start() {
  await authVerifier.init()
  console.log('[auth] Public key loaded')

  const joinCode = await registerWithCloudflare(config)

  server.listen(config.port, () => {
    console.log('')
    console.log('╔══════════════════════════════════════════════════════════╗')
    console.log('║              Local Game Server — Running                 ║')
    console.log(`║  HTTP:    http://localhost:${config.port}                             ║`)
    console.log(`║  WS:      ws://localhost:${config.port}                                ║`)
    console.log('║  Auth:    JWT (RS256) via site                             ║')
    console.log(`║  Site:    ${config.siteBaseUrl}                        ║`)
    console.log(`║  Data:    ${config.dataDir}                           ║`)
    if (joinCode) {
      console.log(`║  Join:    ${joinCode}                                      ║`)
    } else if (config.authToken && config.serverUrl) {
      console.log(`║  Join:    (registration failed)                           ║`)
    }
    console.log('╚══════════════════════════════════════════════════════════╝')
    if (!joinCode) {
      console.log('')
      console.log('  To register for discovery, set LGS_AUTH_TOKEN and LGS_SERVER_URL')
      console.log('  or call: curl -X POST .../api/game/register -H "X-Session-Token: ..."')
    }
    console.log('')
  })
}

start().catch(e => {
  console.error('Failed to start server:', e)
  process.exit(1)
})

/* Persist any debounced store writes before exiting. */
function shutdown(signal) {
  console.log(`\n[server] ${signal} — flushing store and shutting down`)
  try { store.flush() } catch (e) { console.error('[server] flush failed:', e.message) }
  process.exit(0)
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
