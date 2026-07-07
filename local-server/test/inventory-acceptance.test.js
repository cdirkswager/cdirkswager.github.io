import { readFileSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { WebSocket } from 'ws'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const KEY_CANDIDATES = [
  resolve(__dirname, '../../secrets/vtt-private.pem'),
  resolve(__dirname, '../../../secrets/vtt-private.pem'),
]
const PRIVATE_KEY_PATH = KEY_CANDIDATES.find(existsSync) || KEY_CANDIDATES[0]
const PRIVATE_KEY = existsSync(PRIVATE_KEY_PATH) ? readFileSync(PRIVATE_KEY_PATH, 'utf-8') : null

const SERVER_PORT = 3012
const TEST_DATA_DIR = resolve(__dirname, '../data-test-inv')
const BASE = `http://localhost:${SERVER_PORT}`
const WS_BASE = `ws://localhost:${SERVER_PORT}`

function signToken(userId, username, role) {
  if (!PRIVATE_KEY) throw new Error(`Private key not found at ${PRIVATE_KEY_PATH}`)
  const header = { alg: 'RS256', typ: 'JWT', kid: 'test-key' }
  const payload = { sub: userId, username, role, playerId: userId, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 }
  const h = Buffer.from(JSON.stringify(header)).toString('base64url')
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = crypto.sign('RSA-SHA256', Buffer.from(`${h}.${p}`), PRIVATE_KEY)
  return `${h}.${p}.${sig.toString('base64url')}`
}

const ALICE = signToken('alice-1', 'Alice', 'player')
const BOB = signToken('bob-1', 'Bob', 'player')
const GM = signToken('dm-1', 'DM', 'dm')

function wsConnect(token) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(`${WS_BASE}?token=${token}`)
    const onMsg = (raw) => {
      const msg = JSON.parse(raw.toString())
      if (msg.type === 'init') { ws.removeListener('message', onMsg); res({ ws, identity: msg.identity, recordsByType: msg.recordsByType }) }
      else if (msg.type === 'error') { ws.removeListener('message', onMsg); rej(new Error(msg.message)) }
    }
    ws.on('message', onMsg); ws.on('error', rej)
    setTimeout(() => rej(new Error('connect timeout')), 5000)
  })
}
function waitFor(ws, type, timeout = 3000) {
  return new Promise((res, rej) => {
    const h = (raw) => { const m = JSON.parse(raw.toString()); if (m.type === type) { ws.removeListener('message', h); res(m) } }
    ws.on('message', h)
    setTimeout(() => { ws.removeListener('message', h); rej(new Error(`timeout for ${type}`)) }, timeout)
  })
}
const send = (ws, d) => ws.send(JSON.stringify(d))

let serverProcess = null
async function ensureServer(cleanData = true) {
  try { const d = await (await fetch(`${BASE}/api/health`)).json(); if (d.ok) return } catch {}
  if (cleanData) { if (existsSync(TEST_DATA_DIR)) rmSync(TEST_DATA_DIR, { recursive: true }); mkdirSync(TEST_DATA_DIR, { recursive: true }) }
  return new Promise((res, rej) => {
    serverProcess = spawn('node', ['src/index.js'], {
      cwd: ROOT, env: { ...process.env, LGS_PORT: String(SERVER_PORT), LGS_DATA_DIR: TEST_DATA_DIR, NODE_ENV: 'test' },
      stdio: ['ignore', 'pipe', 'pipe'], shell: true,
    })
    const timer = setTimeout(() => rej(new Error('server start timeout')), 15000)
    let started = false
    const onData = (data) => {
      const line = data.toString().trim()
      if (!started && line.includes('Running')) { started = true; clearTimeout(timer); setTimeout(res, 300) }
    }
    serverProcess.stdout.on('data', onData); serverProcess.stderr.on('data', onData)
    serverProcess.on('error', (e) => { clearTimeout(timer); rej(e) })
  })
}
const killServer = () => { if (serverProcess) { serverProcess.kill(); serverProcess = null } }

async function createRecordSeen(sender, kind, spec, others = []) {
  const id = crypto.randomUUID()
  const waiters = [
    waitFor(sender.ws, 'record-created-ack'),
    ...others.map(c => waitFor(c.ws, 'record-created')),
  ]
  send(sender.ws, { type: 'create-record', record: { type: kind, id, ...spec } })
  await Promise.all(waiters)
  return id
}
const createActor = (sender, spec, others) => createRecordSeen(sender, 'actor', spec, others)
const createItem = (sender, spec, others) => createRecordSeen(sender, 'item', spec, others)
async function expectError(ws, sendMsg, needle) {
  const [err] = await Promise.all([waitFor(ws, 'error'), Promise.resolve(send(ws, sendMsg))])
  if (!err.message.toLowerCase().includes(needle.toLowerCase())) throw new Error(`expected "${needle}", got "${err.message}"`)
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════╗')
  console.log('║   Inventory Acceptance — equip / container / loot   ║')
  console.log('╚════════════════════════════════════════════════════╝\n')
  await ensureServer()
  const results = { passed: 0, failed: 0 }
  async function test(name, fn) {
    try { await fn(); results.passed++; console.log(`  ✓ ${name}`) }
    catch (e) { results.failed++; console.log(`  ✗ ${name}: ${e.message}`) }
  }

  const gm = await wsConnect(GM)
  const alice = await wsConnect(ALICE)
  const bob = await wsConnect(BOB)

  let charA, charB, stash, loot
  await test('GM creates character/stash/loot actors; players receive them', async () => {
    charA = await createActor(gm, { name: 'Lyra', actorType: 'character', ownership: { default: 'none', users: { 'alice-1': 'owner' } }, attributes: { attunement: { max: 3 } } }, [alice, bob])
    charB = await createActor(gm, { name: 'Thane', actorType: 'character', ownership: { default: 'none', users: { 'bob-1': 'owner' } } }, [alice, bob])
    stash = await createActor(gm, { name: 'Party Stash', actorType: 'party-stash', ownership: { default: 'owner', users: {} } }, [alice, bob])
    loot = await createActor(gm, { name: 'Chest', actorType: 'loot-pile', ownership: { default: 'owner', users: {} } }, [alice, bob])
  })

  let rapier
  await test('Alice equips a legal item; Bob sees equipped=true', async () => {
    rapier = await createItem(alice, { name: 'Rapier', itemType: 'weapon', slot: 'mainHand', weight: 2, actorId: charA }, [bob, gm])
    const [upd] = await Promise.all([
      waitFor(bob.ws, 'record-updated'),
      Promise.resolve(send(alice.ws, { type: 'update-record', kind: 'item', recordId: rapier, changes: { equipped: true, equippedSlot: 'mainHand' } })),
    ])
    if (upd.record.equipped !== true) throw new Error('not equipped')
    if (upd.record.equippedSlot !== 'mainHand') throw new Error('wrong slot')
  })

  await test('Server rejects an illegal equip slot', async () => {
    const armor = await createItem(alice, { name: 'Chain Mail', itemType: 'armor', slot: 'body', weight: 55, actorId: charA }, [bob, gm])
    await expectError(alice.ws, { type: 'update-record', kind: 'item', recordId: armor, changes: { equipped: true, equippedSlot: 'head' } }, 'Illegal equip slot')
  })

  let pouch
  await test('Container hard capacity is enforced', async () => {
    pouch = await createItem(alice, { name: 'Belt Pouch', itemType: 'container', weight: 1, actorId: charA, container: { capacity: 6, weightless: false } }, [bob, gm])
    const heavy = await createItem(alice, { name: 'Anvil Chunk', itemType: 'misc', weight: 10, actorId: charA }, [bob, gm])
    await expectError(alice.ws, { type: 'update-record', kind: 'item', recordId: heavy, changes: { parentItemId: pouch } }, 'Container is full')
    const light = await createItem(alice, { name: 'Gem', itemType: 'treasure', weight: 2, actorId: charA }, [bob, gm])
    const [upd] = await Promise.all([
      waitFor(bob.ws, 'record-updated'),
      Promise.resolve(send(alice.ws, { type: 'update-record', kind: 'item', recordId: light, changes: { parentItemId: pouch } })),
    ])
    if (upd.record.parentItemId !== pouch) throw new Error('did not nest')
  })

  let gold
  await test('Alice loots from a loot pile (default:owner allows pull)', async () => {
    gold = await createItem(gm, { name: 'Gold', itemType: 'currency', weight: 0.02, quantity: 50, stackable: true, actorId: loot }, [alice, bob])
    const [ack, bobUpd] = await Promise.all([
      waitFor(alice.ws, 'transfer-item-ack'),
      waitFor(bob.ws, 'record-updated'),
      Promise.resolve(send(alice.ws, { type: 'transfer-item', itemId: gold, toActorId: charA, toParentItemId: null, quantity: null })),
    ])
    if (ack.moved.actorId !== charA) throw new Error(`ack actorId ${ack.moved.actorId}`)
    if (bobUpd.record.actorId !== charA) throw new Error(`bob saw actorId ${bobUpd.record.actorId}`)
  })

  await test('Bob cannot pull from an actor he does not own', async () => {
    await expectError(bob.ws, { type: 'transfer-item', itemId: rapier, toActorId: charB, toParentItemId: null, quantity: null }, 'cannot take from source')
  })

  await test('Alice cannot push into an actor she does not own', async () => {
    await expectError(alice.ws, { type: 'transfer-item', itemId: rapier, toActorId: charB, toParentItemId: null, quantity: null }, 'cannot place into destination')
  })

  await test('Server echoes opId in error response', async () => {
    const armor = await createItem(alice, { name: 'Scale Mail', itemType: 'armor', slot: 'body', weight: 45, actorId: charA }, [bob, gm])
    const customOpId = 'my-custom-op-123'
    const [err] = await Promise.all([
      waitFor(alice.ws, 'error'),
      Promise.resolve(send(alice.ws, { type: 'update-record', kind: 'item', recordId: armor, changes: { equipped: true, equippedSlot: 'head' }, opId: customOpId })),
    ])
    if (err.opId !== customOpId) throw new Error(`expected opId "${customOpId}", got "${err.opId}"`)
    if (!err.message.includes('Illegal equip slot')) throw new Error('expected slot rejection')
  })

  await test('Alice can give to the shared party stash', async () => {
    const [ack] = await Promise.all([
      waitFor(alice.ws, 'transfer-item-ack'),
      waitFor(bob.ws, 'record-updated'),
      Promise.resolve(send(alice.ws, { type: 'transfer-item', itemId: rapier, toActorId: stash, toParentItemId: null, quantity: null })),
    ])
    if (ack.moved.actorId !== stash) throw new Error(`actorId ${ack.moved.actorId}`)
    if (ack.moved.equipped !== false) throw new Error('should auto-unequip on transfer')
  })

  let splitId
  await test('Stack split: transfer part of a stack creates a new stack', async () => {
    const [ack] = await Promise.all([
      waitFor(alice.ws, 'transfer-item-ack'),
      Promise.resolve(send(alice.ws, { type: 'transfer-item', itemId: gold, toActorId: stash, toParentItemId: null, quantity: 20 })),
    ])
    if (ack.source.quantity !== 30) throw new Error(`source qty ${ack.source.quantity}`)
    if (ack.moved.quantity !== 20) throw new Error(`moved qty ${ack.moved.quantity}`)
    if (ack.moved.id === gold) throw new Error('split must mint a new id')
    if (ack.moved.actorId !== stash) throw new Error('split not on stash')
    splitId = ack.moved.id
  })

  await test('Server persisted the item/actor records', async () => {
    const data = await (await fetch(`${BASE}/api/records`)).json()
    if (!data.recordsByType.actor || data.recordsByType.actor.length < 4) throw new Error('actors missing')
    if (!data.recordsByType.item || data.recordsByType.item.length < 5) throw new Error('items missing')
  })

  const preGold = await (async () => {
    const data = await (await fetch(`${BASE}/api/records`)).json()
    return data.recordsByType.item.find(i => i.id === gold)
  })()

  alice.ws.close(); bob.ws.close(); gm.ws.close()

  await test('Kill + restart the server process', async () => {
    killServer()
    await new Promise(r => setTimeout(r, 500))
    await ensureServer(false)
  })

  await test('Looted item still belongs to charA after restart', async () => {
    const data = await (await fetch(`${BASE}/api/records`)).json()
    const g = data.recordsByType.item.find(i => i.id === gold)
    if (!g) throw new Error('gold vanished')
    if (g.actorId !== charA) throw new Error(`actorId ${g.actorId} (expected ${charA})`)
    if (g.quantity !== preGold.quantity) throw new Error(`qty ${g.quantity} != ${preGold.quantity}`)
    const split = data.recordsByType.item.find(i => i.id === splitId)
    if (!split || split.actorId !== stash) throw new Error('split stack did not persist on stash')
  })

  console.log(`\nTotal: ${results.passed} passed, ${results.failed} failed`)
  killServer()
  process.exit(results.failed > 0 ? 1 : 0)
}

main().catch(e => { console.error('Fatal:', e); killServer(); process.exit(1) })