import { describe, it, expect } from 'vitest'
import {
  denyCreate, denyMutate, denyEphemeral, createRateLimiter,
  EPHEMERAL_POLICY, EPHEMERAL_MAX_PAYLOAD_BYTES,
} from './permissions.js'

const dm = { userId: 'dm-1', username: 'DM', role: 'dm' }
const player = { userId: 'p1', username: 'Alice', role: 'player' }

function ctxWith(actors = {}) {
  return { resolveActor: (id) => actors[id] ?? null }
}

describe('permissions — record create', () => {
  it('only the DM can create scenes and actors', () => {
    expect(denyCreate('scene', {}, player, ctxWith())).toMatch(/only the DM/)
    expect(denyCreate('actor', {}, player, ctxWith())).toMatch(/only DM/)
    expect(denyCreate('scene', {}, dm, ctxWith())).toBeNull()
    expect(denyCreate('actor', {}, dm, ctxWith())).toBeNull()
  })

  it('items require an actor the creator owns', () => {
    const owned = { id: 'a1', ownership: { default: 'none', users: { p1: 'owner' } } }
    const foreign = { id: 'a2', ownership: { default: 'none', users: {} } }
    const actors = { a1: owned, a2: foreign }
    expect(denyCreate('item', { actorId: 'a1' }, player, ctxWith(actors))).toBeNull()
    expect(denyCreate('item', { actorId: 'a2' }, player, ctxWith(actors))).toMatch(/not the actor owner/)
    expect(denyCreate('item', {}, player, ctxWith(actors))).toMatch(/requires actorId/)
    expect(denyCreate('item', { actorId: 'missing' }, player, ctxWith(actors))).toMatch(/not found/)
  })

  it('players cannot conjure items into loot piles or the party stash', () => {
    const pile = { id: 'lp', actorType: 'loot-pile', ownership: { default: 'owner', users: {} } }
    expect(denyCreate('item', { actorId: 'lp' }, player, ctxWith({ lp: pile }))).toMatch(/Only the DM/)
    expect(denyCreate('item', { actorId: 'lp' }, dm, ctxWith({ lp: pile }))).toBeNull()
  })
})

describe('permissions — record mutate', () => {
  it('scene mutation is DM-only', () => {
    expect(denyMutate('scene', { id: 's1' }, player, ctxWith())).toBe('Permission denied')
    expect(denyMutate('scene', { id: 's1' }, dm, ctxWith())).toBeNull()
  })

  it('generic records: creator or DM', () => {
    const mine = { id: 'w1', createdBy: 'p1' }
    const theirs = { id: 'w2', createdBy: 'p2' }
    expect(denyMutate('wall', mine, player, ctxWith())).toBeNull()
    expect(denyMutate('wall', theirs, player, ctxWith())).toBe('Permission denied')
    expect(denyMutate('wall', theirs, dm, ctxWith())).toBeNull()
  })

  it('tokens fall back to actor ownership when linked', () => {
    const actor = { id: 'a1', ownership: { default: 'none', users: { p1: 'owner' } } }
    const token = { id: 't1', actorId: 'a1', createdBy: 'someone-else' }
    expect(denyMutate('token', token, player, ctxWith({ a1: actor }))).toBeNull()
  })
})

describe('permissions — ephemeral policy', () => {
  it('relays only allowlisted types', () => {
    expect(denyEphemeral({ type: 'ping', x: 1, y: 2 }, player, 50)).toBeNull()
    expect(denyEphemeral({ type: 'ruler-update' }, player, 50)).toBeNull()
    expect(denyEphemeral({ type: 'made-up-thing' }, player, 50)).toMatch(/Unknown ephemeral/)
    expect(denyEphemeral({}, player, 50)).toMatch(/requires a type/)
    expect(denyEphemeral(null, player, 50)).toMatch(/requires a type/)
  })

  it('DM-gates table-wide scene verbs', () => {
    expect(denyEphemeral({ type: 'scene:switched', sceneId: 's1' }, player, 50)).toMatch(/DM only/)
    expect(denyEphemeral({ type: 'scene:move-all-users', sceneId: 's1' }, player, 50)).toMatch(/DM only/)
    expect(denyEphemeral({ type: 'scene:switched', sceneId: 's1' }, dm, 50)).toBeNull()
    expect(denyEphemeral({ type: 'scene:move-all-users', sceneId: 's1' }, dm, 50)).toBeNull()
  })

  it('players may announce their own presence', () => {
    expect(denyEphemeral({ type: 'scene:user-presence', sceneId: 's1' }, player, 50)).toBeNull()
  })

  it('caps payload size', () => {
    expect(denyEphemeral({ type: 'ping' }, player, EPHEMERAL_MAX_PAYLOAD_BYTES + 1)).toMatch(/too large/)
  })

  it('every policy entry declares dmOnly explicitly', () => {
    for (const [type, policy] of Object.entries(EPHEMERAL_POLICY)) {
      expect(typeof policy.dmOnly, type).toBe('boolean')
    }
  })
})

describe('permissions — rate limiter', () => {
  it('allows bursts up to capacity then throttles', () => {
    const limiter = createRateLimiter({ ratePerSec: 10, burst: 5 })
    let allowed = 0
    for (let i = 0; i < 20; i++) if (limiter.allow()) allowed++
    expect(allowed).toBe(5)   // burst drained, refill negligible in a tight loop
  })

  it('refills over time', async () => {
    const limiter = createRateLimiter({ ratePerSec: 1000, burst: 2 })
    limiter.allow(); limiter.allow()
    expect(limiter.allow()).toBe(false)
    await new Promise(r => setTimeout(r, 10))   // ~10 tokens refilled
    expect(limiter.allow()).toBe(true)
  })
})
