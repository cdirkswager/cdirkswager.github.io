/* E2E of the redesigned sync loop with the REAL client modules:
   EventBus + VttSyncClient + WorldStore, two clients, live server.
   Verifies: server-seeded scene, snapshot hydration, cross-client token
   sync onto the correct scene, HP sync, combat DM-gating, and that a
   player viewing a different scene still receives everything. */
import { spawn } from 'node:child_process'
import { copyFileSync, rmSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import crypto2 from 'node:crypto'

const require = createRequire(import.meta.url)
globalThis.WebSocket = require('ws').WebSocket

const ROOT = '/home/claude/cdirkswager.github.io-main'
const { EventBus } = await import(ROOT + '/src/vtt/canvas/EventBus.js')
const { VttSyncClient } = await import(ROOT + '/src/vtt/canvas/VttSyncClient.js')
const { WorldStore } = await import(ROOT + '/src/vtt/WorldStore.js')

const KEY = readFileSync(ROOT + '/secrets/vtt-private.pem', 'utf8')
function mkToken(userId, username, role) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'test-key' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({
    sub: userId, userId, username, role, playerId: userId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  })).toString('base64url')
  const sig = crypto2.sign('RSA-SHA256', Buffer.from(header + '.' + payload), KEY).toString('base64url')
  return header + '.' + payload + '.' + sig
}

copyFileSync(ROOT + '/secrets/vtt-public.pem', ROOT + '/local-server/vtt-public.pem')
rmSync(ROOT + '/local-server/data-e2e', { recursive: true, force: true })
const server = spawn('node', ['src/index.js'], {
  cwd: ROOT + '/local-server',
  env: { ...process.env, LGS_DATA_DIR: './data-e2e', LGS_PORT: '3123', LGS_SITE_BASE_URL: 'http://127.0.0.1:1' },
  stdio: 'ignore',
})
await new Promise(r => setTimeout(r, 2500))

let pass = 0, fail = 0
const check = (name, ok) => { ok ? pass++ : fail++; console.log((ok ? '  ✓ ' : '  ✗ ') + name) }
const wait = (ms) => new Promise(r => setTimeout(r, ms))

async function makeClient(userId, username, role) {
  const bus = new EventBus()
  const world = new WorldStore(bus).bind()
  const errors = []
  bus.on('sync-error', e => errors.push(e))
  const client = new VttSyncClient({
    eventBus: bus, url: 'ws://localhost:3123',
    getToken: () => mkToken(userId, username, role),
  })
  await new Promise((resolve) => {
    client.onAuthenticated = resolve
    client.connect()
  })
  /* Simulate the canvas mounting: bridge signals ready → buffer flush. */
  bus.emit('sync-bridge:ready', {})
  return { bus, world, client, errors }
}

const dm = await makeClient('u-dm', 'DM', 'dm')
const p1 = await makeClient('u-p1', 'Alice', 'player')
await wait(300)

/* 1 — server-seeded world */
check('server self-seeded a default scene', dm.world.sceneList.length === 1 && !dm.world.sceneList[0]._isLocalDefault)
check('both clients landed on the SAME scene id', dm.world.viewedSceneId === p1.world.viewedSceneId && !!dm.world.viewedSceneId)

const sceneA = dm.world.viewedSceneId

/* 2 — DM creates a second scene; player receives it (no view change) */
dm.bus.emitRecord('scene', 'created', { id: 'scene-B', name: 'Crypt', width: 2000, height: 2000, gridSize: 100, gridType: 'square' })
await wait(300)
check('player received scene B', p1.world.scenes.has('scene-B'))
check('player still views scene A (no yank)', p1.world.viewedSceneId === sceneA)

/* 3 — DM drops a token with tactical stats on scene A */
dm.bus.emitRecord('token', 'created', { id: 'tok-1', name: 'Goblin', x: 300, y: 300, width: 100, height: 100, sceneId: sceneA, hp: 7, maxHp: 7, speed: 30 })
await wait(300)
{
  const { token, scene } = p1.world.findToken('tok-1')
  check('player received the token', !!token)
  check('token landed on the correct scene', scene?.id === sceneA)
  check('tactical stats synced (hp/maxHp/speed)', token?.hp === 7 && token?.maxHp === 7 && token?.speed === 30)
}

/* 4 — player views scene B; a token created on A must STILL reach them */
p1.world.setViewedScene('scene-B')
dm.bus.emitRecord('token', 'created', { id: 'tok-2', name: 'Orc', x: 500, y: 500, width: 100, height: 100, sceneId: sceneA })
await wait(300)
check('off-screen token was stored, not dropped', p1.world.findToken('tok-2').token != null)
check('…on scene A even while player views B', p1.world.findToken('tok-2').scene?.id === sceneA)

/* 5 — HP damage syncs */
dm.bus.emitRecord('token', 'updated', { id: 'tok-1', sceneId: sceneA, hp: 2 })
await wait(300)
check('HP change reached the player', p1.world.findToken('tok-1').token?.hp === 2)

/* 6 — combat: DM allowed, player denied */
dm.bus.emitRecord('combat', 'created', { id: 'combat', sceneId: sceneA, round: 1, turnIndex: 0, combatants: [{ tokenId: 'tok-1', name: 'Goblin', initiative: 15 }] })
await wait(300)
check('combat record synced to player', p1.world.combat?.round === 1)
const errsBefore = p1.errors.length
p1.bus.emitRecord('combat', 'updated', { id: 'combat', turnIndex: 5 })
await wait(300)
check('player combat mutation DENIED by server', p1.errors.length > errsBefore)
check('…and did not corrupt DM state', dm.world.combat?.turnIndex === 0)

/* 6b — actors & items flow through the same store (inventory backbone) */
dm.bus.emitRecord('actor', 'created', { id: 'act-1', name: 'Aria', actorType: 'pc', ownership: { 'u-p1': 'owner' } })
await wait(250)
dm.bus.emitRecord('item', 'created', { id: 'it-1', actorId: 'act-1', name: 'Rapier', weight: 2, itemType: 'weapon', slot: 'mainHand' })
await wait(250)
check('actor synced into world.actors', p1.world.actors.get('act-1')?.name === 'Aria')
check('item synced into world.items', p1.world.items.get('it-1')?.name === 'Rapier')
p1.bus.emitRecord('item', 'updated', { id: 'it-1', equipped: true, equippedSlot: 'mainHand' }, 'op-eq-1')
await wait(250)
check('owner equip synced back to DM', dm.world.items.get('it-1')?.equipped === true)

/* 7 — reconnect resync: kill nothing, just re-init via a fresh client for same user */
const p2 = await makeClient('u-p1', 'Alice', 'player')
await wait(200)
check('rejoining client hydrates full world (2 scenes, 2 tokens)', p2.world.scenes.size === 2 && p2.world.findToken('tok-1').token != null && p2.world.findToken('tok-2').token != null)

console.log(`\nTotal: ${pass} passed, ${fail} failed`)
dm.client.destroy?.(); p1.client.destroy?.(); p2.client.destroy?.()
server.kill('SIGKILL')
rmSync(ROOT + '/local-server/data-e2e', { recursive: true, force: true })
rmSync(ROOT + '/local-server/vtt-public.pem', { force: true })
process.exit(fail ? 1 : 0)
