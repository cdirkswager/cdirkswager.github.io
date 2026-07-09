import { describe, it, expect, beforeEach } from 'vitest'
import { EventBus } from './EventBus.js'
import { VttSyncClient } from './VttSyncClient.js'

/* Fake WebSocket-shaped object: records sends, always "open". */
function fakeWs() {
  return { readyState: 1, sent: [], send(data) { this.sent.push(JSON.parse(data)) }, close() {} }
}

/* WebSocket.OPEN constant is referenced by _onEphemeral. jsdom provides
   WebSocket, but guard for bare-node environments. */
if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = { OPEN: 1 }
}

describe('VttSyncClient — ephemeral echo protection', () => {
  let bus, client, ws

  beforeEach(() => {
    bus = new EventBus()
    client = new VttSyncClient({ eventBus: bus, getToken: () => 'a.b.c', url: 'ws://test' })
    ws = fakeWs()
    client.ws = ws
    client._subscribe()
    /* Live events are gated behind bridge readiness (pre-mount buffer);
       these tests exercise the steady state. */
    client._bridgeReady = true
  })

  it('sends locally emitted ephemerals to the server', () => {
    bus.emitEphemeral('scene:move-all-users', { sceneId: 's1' })
    expect(ws.sent).toHaveLength(1)
    expect(ws.sent[0].type).toBe('ephemeral')
    expect(ws.sent[0].payload.type).toBe('scene:move-all-users')
  })

  it('does NOT re-send ephemerals that arrived from the network (echo loop)', () => {
    /* Simulate a server-relayed ephemeral from another user. */
    client._onMessage({
      type: 'ephemeral',
      userId: 'user-2',
      by: 'Player Two',
      payload: { type: 'scene:move-all-users', sceneId: 's1' },
    })
    /* The local bus should have seen it (so the bridge can act on it)... */
    let seen = null
    // re-run to also verify subscribers receive it
    bus.on('ephemeral', (e) => { seen = e })
    client._onMessage({
      type: 'ephemeral',
      userId: 'user-2',
      by: 'Player Two',
      payload: { type: 'ping', x: 1, y: 2 },
    })
    expect(seen).toBeTruthy()
    expect(seen.fromUserId).toBe('user-2')
    /* ...but nothing may have been sent back to the server. */
    expect(ws.sent).toHaveLength(0)
  })

  it('stamps network ephemerals with fromUserId so layers can distinguish origin', () => {
    let seen = null
    bus.on('ephemeral', (e) => { seen = e })
    client._onMessage({ type: 'ephemeral', userId: 'u9', by: 'Nine', payload: { type: 'ping', x: 0, y: 0 } })
    expect(seen.fromUserId).toBe('u9')
    expect(seen.fromUsername).toBe('Nine')
  })

  it('surfaces presence pushes on the bus and replays the latest on bridge-ready', () => {
    const snapshots = []
    bus.on('presence', (p) => snapshots.push(p.users))
    client._onMessage({ type: 'presence', users: [{ userId: 'u1' }, { userId: 'u2' }] })
    expect(snapshots).toHaveLength(1)
    expect(snapshots[0]).toHaveLength(2)
    /* Late subscriber path: bridge-ready triggers replay of cached presence. */
    bus.emit('sync-bridge:ready', {})
    expect(snapshots).toHaveLength(2)
    expect(snapshots[1]).toHaveLength(2)
  })
})
