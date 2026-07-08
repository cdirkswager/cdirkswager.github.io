import { readFileSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { WebSocket } from 'ws'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

// Read private key for signing test tokens (repo secrets/, with the old
// out-of-repo location as a fallback)
const KEY_CANDIDATES = [
  resolve(__dirname, '../../secrets/vtt-private.pem'),
  resolve(__dirname, '../../../secrets/vtt-private.pem'),
]
const PRIVATE_KEY_PATH = KEY_CANDIDATES.find(existsSync) || KEY_CANDIDATES[0]
const PRIVATE_KEY = existsSync(PRIVATE_KEY_PATH) ? readFileSync(PRIVATE_KEY_PATH, 'utf-8') : null

const SERVER_PORT = 3011
const TEST_DATA_DIR = resolve(__dirname, '../data-test')
const BASE = `http://localhost:${SERVER_PORT}`
const WS_BASE = `ws://localhost:${SERVER_PORT}`

// ---- helpers ----

function signToken(userId, username, role) {
  if (!PRIVATE_KEY) throw new Error(`Private key not found at ${PRIVATE_KEY_PATH}`)
  const header = { alg: 'RS256', typ: 'JWT', kid: 'test-key' }
  const payload = {
    sub: userId,
    username,
    role,
    playerId: userId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  }
  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url')
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = crypto.sign('RSA-SHA256', Buffer.from(`${headerB64}.${payloadB64}`), PRIVATE_KEY)
  return `${headerB64}.${payloadB64}.${sig.toString('base64url')}`
}

const ALICE_TOKEN = signToken('alice-1', 'Alice', 'player')
const BOB_TOKEN = signToken('bob-1', 'Bob', 'player')
const GM_TOKEN = signToken('dm-1', 'DM', 'dm')

function wsConnect(token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS_BASE}?token=${token}`)
    const onMsg = (raw) => {
      const msg = JSON.parse(raw.toString())
      if (msg.type === 'init') {
        ws.removeListener('message', onMsg)
        resolve({ ws, identity: msg.identity, recordsByType: msg.recordsByType })
      } else if (msg.type === 'error') {
        ws.removeListener('message', onMsg)
        reject(new Error(msg.message))
      }
    }
    ws.on('message', onMsg)
    ws.on('error', reject)
    setTimeout(() => reject(new Error('Timeout connecting')), 5000)
  })
}

function waitFor(ws, type, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const handler = (raw) => {
      const msg = JSON.parse(raw.toString())
      if (msg.type === type) {
        ws.removeListener('message', handler)
        resolve(msg)
      }
    }
    ws.on('message', handler)
    setTimeout(() => {
      ws.removeListener('message', handler)
      reject(new Error(`Timeout for ${type}`))
    }, timeout)
  })
}

function send(ws, data) {
  ws.send(JSON.stringify(data))
}

// ---- server lifecycle ----

let serverProcess = null

async function ensureServer(cleanData = true) {
  const healthUrl = `${BASE}/api/health`
  try {
    const res = await fetch(healthUrl)
    const d = await res.json()
    if (d.ok) return
  } catch {}

  if (cleanData) {
    if (existsSync(TEST_DATA_DIR)) rmSync(TEST_DATA_DIR, { recursive: true })
    mkdirSync(TEST_DATA_DIR, { recursive: true })
  }

  return new Promise((resolve, reject) => {
    serverProcess = spawn('node', ['src/index.js'], {
      cwd: ROOT,
      env: {
        ...process.env,
        LGS_PORT: String(SERVER_PORT),
        LGS_DATA_DIR: TEST_DATA_DIR,
        NODE_ENV: 'test',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    })

    const timer = setTimeout(() => reject(new Error('Server start timeout')), 15000)
    let started = false

    const onData = (data) => {
      const line = data.toString().trim()
      if (line) console.log(`  [server] ${line}`)
      if (!started && line.includes('Running')) {
        started = true
        clearTimeout(timer)
        setTimeout(resolve, 300)
      }
    }
    serverProcess.stdout.on('data', onData)
    serverProcess.stderr.on('data', onData)
    serverProcess.on('error', (e) => { clearTimeout(timer); reject(e) })
  })
}

function killServer() {
  if (serverProcess) {
    serverProcess.kill()
    serverProcess = null
  }
}

// ---- test harness ----

async function main() {
  console.log('')
  console.log('╔══════════════════════════════════════════════════╗')
  console.log('║       VTT Acceptance Tests — Two-Client Sync    ║')
  console.log('╚══════════════════════════════════════════════════╝')
  console.log('')

  console.log('Starting test server...')
  await ensureServer()
  console.log('')

  const results = { passed: 0, failed: 0 }

  async function test(name, fn) {
    try {
      await fn()
      results.passed++
      console.log(`  ✓ ${name}`)
    } catch (e) {
      results.failed++
      console.log(`  ✗ ${name}: ${e.message}`)
    }
  }

  // ---- Test 1: Two-Client Sync ----

  let alice, bob, gm

  await test('Alice connects and receives identity', async () => {
    alice = await wsConnect(ALICE_TOKEN)
    if (alice.identity.userId !== 'alice-1') throw new Error(`userId: ${alice.identity.userId}`)
    if (alice.identity.role !== 'player') throw new Error(`role: ${alice.identity.role}`)
    if (alice.identity.username !== 'Alice') throw new Error(`username: ${alice.identity.username}`)
  })

  await test('Bob connects and receives identity', async () => {
    bob = await wsConnect(BOB_TOKEN)
    if (bob.identity.userId !== 'bob-1') throw new Error(`userId: ${bob.identity.userId}`)
  })

  await test('GM connects and receives identity', async () => {
    gm = await wsConnect(GM_TOKEN)
    if (gm.identity.role !== 'dm') throw new Error(`role: ${gm.identity.role}`)
  })

  await test('Alice creates a template, Bob receives it', async () => {
    const tpl = {
      type: 'template', id: crypto.randomUUID(),
      shape: 'circle', x: 100, y: 200, radius: 50,
      owner: 'alice-1', label: 'Fireball',
    }

    send(alice.ws, { type: 'create-record', record: tpl })
    const [bobMsg, ack] = await Promise.all([
      waitFor(bob.ws, 'record-created'),
      waitFor(alice.ws, 'record-created-ack'),
    ])

    if (bobMsg.record.id !== tpl.id) throw new Error(`id: ${bobMsg.record.id}`)
    if (bobMsg.record.type !== 'template') throw new Error(`type: ${bobMsg.record.type}`)
    if (bobMsg.record.shape !== 'circle') throw new Error(`shape: ${bobMsg.record.shape}`)
    if (ack.record.id !== tpl.id) throw new Error(`ack.id: ${ack.record.id}`)
    if (ack.kind !== 'template') throw new Error(`ack.kind: ${ack.kind}`)

    // Also consume GM's broadcast
    await waitFor(gm.ws, 'record-created').catch(() => {})
  })

  await test('Alice creates a token, Bob+GM see it', async () => {
    const tok = {
      type: 'token', id: crypto.randomUUID(),
      x: 300, y: 400, owner: 'alice-1',
    }

    send(alice.ws, { type: 'create-record', record: tok })
    const [ack, bobMsg, gmMsg] = await Promise.all([
      waitFor(alice.ws, 'record-created-ack'),
      waitFor(bob.ws, 'record-created'),
      waitFor(gm.ws, 'record-created'),
    ])

    if (ack.record.id !== tok.id) throw new Error(`ack.id: ${ack.record.id}`)
    if (ack.kind !== 'token') throw new Error(`ack.kind: ${ack.kind}`)
    if (bobMsg.record.id !== tok.id) throw new Error(`bob.id: ${bobMsg.record.id}`)
    if (gmMsg.record.id !== tok.id) throw new Error(`gm.id: ${gmMsg.record.id}`)
  })

  await test('GM creates a template, both Alice and Bob receive it', async () => {
    const tpl = {
      type: 'template', id: crypto.randomUUID(),
      shape: 'cone', x: 200, y: 300, direction: 0, angle: 60, range: 100,
      owner: 'gm-1',
    }

    send(gm.ws, { type: 'create-record', record: tpl })
    const [ack, aliceMsg, bobMsg] = await Promise.all([
      waitFor(gm.ws, 'record-created-ack'),
      waitFor(alice.ws, 'record-created'),
      waitFor(bob.ws, 'record-created'),
    ])

    if (aliceMsg.record.id !== tpl.id) throw new Error(`id: ${aliceMsg.record.id}`)
    if (aliceMsg.record.type !== 'template') throw new Error(`type: ${aliceMsg.record.type}`)
  })

  await test('Server persists records per-type', async () => {
    const res = await fetch(`${BASE}/api/records`)
    const data = await res.json()
    if (!data.recordsByType.template || data.recordsByType.template.length < 2) throw new Error(`templates: ${data.recordsByType.template?.length}`)
    if (!data.recordsByType.token || data.recordsByType.token.length < 1) throw new Error(`tokens: ${data.recordsByType.token?.length}`)
  })

  await test('Bob updates his own record, Alice sees update', async () => {
    const tok = {
      type: 'token', id: crypto.randomUUID(),
      x: 500, y: 600, owner: 'bob-1',
    }

    await Promise.all([
      waitFor(bob.ws, 'record-created-ack'),
      Promise.resolve(send(bob.ws, { type: 'create-record', record: tok })),
    ])

    const [msg] = await Promise.all([
      waitFor(alice.ws, 'record-updated'),
      Promise.resolve(send(bob.ws, { type: 'update-record', kind: 'token', recordId: tok.id, changes: { x: 999 } })),
    ])

    if (msg.record.x !== 999) throw new Error(`x: ${msg.record.x}`)
    if (msg.record.id !== tok.id) throw new Error(`id: ${msg.record.id}`)
  })

  await test('Alice cannot update Bob\'s record', async () => {
    const tok = {
      type: 'token', id: crypto.randomUUID(),
      x: 1000, y: 1100, owner: 'bob-1',
    }

    await Promise.all([
      waitFor(bob.ws, 'record-created-ack'),
      Promise.resolve(send(bob.ws, { type: 'create-record', record: tok })),
    ])

    const [msg] = await Promise.all([
      waitFor(alice.ws, 'error'),
      Promise.resolve(send(alice.ws, { type: 'update-record', kind: 'token', recordId: tok.id, changes: { x: 666 } })),
    ])

    if (!msg.message.includes('Permission denied')) throw new Error(`error: ${msg.message}`)
  })

  await test('GM can update any record', async () => {
    const tok = {
      type: 'token', id: crypto.randomUUID(),
      x: 2000, y: 2100, owner: 'alice-1',
    }

    await Promise.all([
      waitFor(alice.ws, 'record-created-ack'),
      Promise.resolve(send(alice.ws, { type: 'create-record', record: tok })),
    ])

    const [msg] = await Promise.all([
      waitFor(bob.ws, 'record-updated'),
      Promise.resolve(send(gm.ws, { type: 'update-record', kind: 'token', recordId: tok.id, changes: { x: 777 } })),
    ])

    if (msg.record.x !== 777) throw new Error(`x: ${msg.record.x}`)
  })

  await test('Ephemeral messages relay to other clients', async () => {
    send(alice.ws, { type: 'ephemeral', payload: { type: 'ping', x: 50, y: 75 } })
    const msg = await waitFor(bob.ws, 'ephemeral')

    if (msg.userId !== 'alice-1') throw new Error(`userId: ${msg.userId}`)
    if (msg.payload.x !== 50) throw new Error(`x: ${msg.payload.x}`)
    if (msg.payload.type !== 'ping') throw new Error(`payloadType: ${msg.payload.type}`)
  })

  await test('Delete record broadcasts to other clients', async () => {
    const tpl = {
      type: 'template', id: crypto.randomUUID(),
      shape: 'rectangle', x: 0, y: 0, width: 100, height: 100,
      owner: 'alice-1',
    }

    send(alice.ws, { type: 'create-record', record: tpl })
    await Promise.all([
      waitFor(alice.ws, 'record-created-ack'),
      waitFor(bob.ws, 'record-created'),
    ])

    send(alice.ws, { type: 'delete-record', kind: 'template', recordId: tpl.id })
    const [msg] = await Promise.all([
      waitFor(bob.ws, 'record-deleted'),
      waitFor(alice.ws, 'record-deleted').catch(() => {}),
    ])

    if (msg.recordId !== tpl.id) throw new Error(`recordId: ${msg.recordId}`)
    if (msg.kind !== 'template') throw new Error(`kind: ${msg.kind}`)
  })

  // ---- Cleanup Test 1 ----
  if (alice) alice.ws.close()
  if (bob) bob.ws.close()
  if (gm) gm.ws.close()

  // ---- Test 2: Persistence Across Restart ----

  console.log('')
  console.log('╔══════════════════════════════════════════════════╗')
  console.log('║   Acceptance Test 2: Server Restart Persistence ║')
  console.log('╚══════════════════════════════════════════════════╝')
  console.log('')

  // Count existing records before restart
  let preCounts
  {
    const res = await fetch(`${BASE}/api/records`)
    const data = await res.json()
    preCounts = {
      templates: data.recordsByType.template?.length || 0,
      tokens: data.recordsByType.token?.length || 0,
    }
    console.log(`  [pre-restart] ${preCounts.templates} templates, ${preCounts.tokens} tokens`)
  }

  await test('Kill and restart server (data dir preserved)', async () => {
    killServer()
    // Small delay to ensure port is released
    await new Promise(r => setTimeout(r, 500))
    await ensureServer(false) // restart without wiping data
  })

  {
    let client

    await test('Connect after restart, records in init', async () => {
      client = await wsConnect(ALICE_TOKEN)
      const byType = client.recordsByType
      if (!byType.template || byType.template.length < 1) throw new Error(`templates: ${byType.template?.length}`)
      if (!byType.token || byType.token.length < 1) throw new Error(`tokens: ${byType.token?.length}`)
    })

    await test('Record counts match pre-restart', async () => {
      const res = await fetch(`${BASE}/api/records`)
      const data = await res.json()
      const tmpl = data.recordsByType.template?.length || 0
      const tok = data.recordsByType.token?.length || 0
      if (tmpl !== preCounts.templates) throw new Error(`templates: expected ${preCounts.templates}, got ${tmpl}`)
      if (tok !== preCounts.tokens) throw new Error(`tokens: expected ${preCounts.tokens}, got ${tok}`)
    })

    await test('Surviving records have correct fields', async () => {
      const res = await fetch(`${BASE}/api/records`)
      const data = await res.json()
      const template = data.recordsByType.template?.[0]
      if (!template || !template.id) throw new Error('Template has no id')
      if (!template.createdAt) throw new Error('Template has no createdAt')
      if (!template.createdBy) throw new Error('Template has no createdBy')
      if (!template.updatedAt) throw new Error('Template has no updatedAt')
    })

    await test('Can create new records after restart', async () => {
      const tok = {
        type: 'token', id: crypto.randomUUID(),
        x: 9999, y: 8888, owner: 'alice-1',
      }
      send(client.ws, { type: 'create-record', record: tok })
      const ack = await waitFor(client.ws, 'record-created-ack')
      if (ack.record.id !== tok.id) throw new Error(`ack.id: ${ack.record.id}`)
    })

    if (client) client.ws.close()
  }

  // ---- Test 3: Server Rejects Unauthorized Edits ----

  console.log('')
  console.log('╔══════════════════════════════════════════════════╗')
  console.log('║   Acceptance Test 3: Permission Enforcement     ║')
  console.log('╚══════════════════════════════════════════════════╝')
  console.log('')

  {
    const a = await wsConnect(ALICE_TOKEN)
    const b = await wsConnect(BOB_TOKEN)
    const g = await wsConnect(GM_TOKEN)

    await test('Alice creates a template, Bob cannot update it', async () => {
      const tpl = {
        type: 'template', id: crypto.randomUUID(),
        shape: 'circle', x: 10, y: 20, radius: 30,
        owner: 'alice-1',
      }

      send(a.ws, { type: 'create-record', record: tpl })
      await Promise.all([
        waitFor(a.ws, 'record-created-ack'),
        waitFor(b.ws, 'record-created'),
        waitFor(g.ws, 'record-created'),
      ])

      const [err] = await Promise.all([
        waitFor(b.ws, 'error'),
        Promise.resolve(send(b.ws, { type: 'update-record', kind: 'template', recordId: tpl.id, changes: { x: 999 } })),
      ])
      if (!err.message.includes('Permission denied')) throw new Error(`msg: ${err.message}`)
    })

    await test('Bob cannot delete Alice\'s template', async () => {
      const tpl = {
        type: 'template', id: crypto.randomUUID(),
        shape: 'rectangle', x: 0, y: 0, width: 50, height: 50,
        owner: 'alice-1',
      }

      send(a.ws, { type: 'create-record', record: tpl })
      await Promise.all([
        waitFor(a.ws, 'record-created-ack'),
        waitFor(b.ws, 'record-created'),
        waitFor(g.ws, 'record-created'),
      ])

      const [err] = await Promise.all([
        waitFor(b.ws, 'error'),
        Promise.resolve(send(b.ws, { type: 'delete-record', kind: 'template', recordId: tpl.id })),
      ])
      if (!err.message.includes('Permission denied')) throw new Error(`msg: ${err.message}`)
    })

    await test('Alice cannot delete Bob\'s token', async () => {
      const tok = {
        type: 'token', id: crypto.randomUUID(),
        x: 100, y: 200, owner: 'bob-1',
      }

      send(b.ws, { type: 'create-record', record: tok })
      await Promise.all([
        waitFor(b.ws, 'record-created-ack'),
        waitFor(a.ws, 'record-created'),
        waitFor(g.ws, 'record-created'),
      ])

      const [err] = await Promise.all([
        waitFor(a.ws, 'error'),
        Promise.resolve(send(a.ws, { type: 'delete-record', kind: 'token', recordId: tok.id })),
      ])
      if (!err.message.includes('Permission denied')) throw new Error(`msg: ${err.message}`)
    })

    await test('GM can update Alice\'s record', async () => {
      const tpl = {
        type: 'template', id: crypto.randomUUID(),
        shape: 'cone', x: 0, y: 0, direction: 0, angle: 60, range: 100,
        owner: 'alice-1',
      }

      send(a.ws, { type: 'create-record', record: tpl })
      await Promise.all([
        waitFor(a.ws, 'record-created-ack'),
        waitFor(b.ws, 'record-created'),
        waitFor(g.ws, 'record-created'),
      ])

      const [msg] = await Promise.all([
        waitFor(a.ws, 'record-updated'),
        Promise.resolve(send(g.ws, { type: 'update-record', kind: 'template', recordId: tpl.id, changes: { range: 200 } })),
      ])
      if (msg.record.range !== 200) throw new Error(`range: ${msg.record.range}`)
    })

    await test('GM can delete Bob\'s record', async () => {
      const tok = {
        type: 'token', id: crypto.randomUUID(),
        x: 300, y: 400, owner: 'bob-1',
      }

      send(b.ws, { type: 'create-record', record: tok })
      await Promise.all([
        waitFor(b.ws, 'record-created-ack'),
        waitFor(a.ws, 'record-created'),
        waitFor(g.ws, 'record-created'),
      ])

      send(g.ws, { type: 'delete-record', kind: 'token', recordId: tok.id })
      const aDel = await waitFor(a.ws, 'record-deleted')
      const bDel = await waitFor(b.ws, 'record-deleted')

      if (aDel.recordId !== tok.id) throw new Error(`a.recordId: ${aDel.recordId}`)
      if (bDel.recordId !== tok.id) throw new Error(`b.recordId: ${bDel.recordId}`)
    })

    a.ws.close()
    b.ws.close()
    g.ws.close()
  }

  console.log(`\nTotal: ${results.passed} passed, ${results.failed} failed`)
  killServer()
  if (results.failed > 0) process.exit(1)
}

main().catch(e => {
  console.error('Fatal:', e)
  killServer()
  process.exit(1)
})
