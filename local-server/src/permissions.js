import { hasAccess } from '../../src/vtt/canvas/ownership.js'

/**
 * permissions.js — single home for "who may do what" on the game server.
 *
 * Three concerns:
 *   1. Record CRUD permissions (kind × action → rule)
 *   2. Ephemeral message policy (allowlist + DM-gating + size cap)
 *   3. Per-connection rate limiting (token bucket)
 *
 * websocket.js consults this module and stays a thin router.
 */

/* ── Record permissions ─────────────────────────────────────────── */

function isDm(identity) { return identity.role === 'dm' }

function actorAccess(identity, actor) {
  if (isDm(identity)) return true
  return !!actor && hasAccess(identity, actor, 'owner')
}

function ownRecord(identity, existing) {
  return !existing?.createdBy || existing.createdBy === identity.userId || isDm(identity)
}

/**
 * May `identity` create a record of `kind`?
 * `ctx.resolveActor(actorId)` looks up an actor for ownership checks.
 * Returns null when permitted, or a denial message string.
 */
export function denyCreate(kind, record, identity, ctx) {
  if (kind === 'scene' && !isDm(identity)) return 'Permission denied: only the DM can create scenes'
  if (kind === 'actor' && !isDm(identity)) return 'Permission denied: only DM can create actors'

  if (kind === 'item') {
    if (!record.actorId) return 'Item requires actorId'
    const actor = ctx.resolveActor(record.actorId)
    if (!actor) return 'Actor not found'
    if (!actorAccess(identity, actor)) return 'Permission denied: not the actor owner'
    if ((actor.actorType === 'loot-pile' || actor.actorType === 'party-stash') && !isDm(identity)) {
      return 'Only the DM can add new items here'
    }
  }

  if (kind === 'token' && record.actorId) {
    const actor = ctx.resolveActor(record.actorId)
    if (!actor) return 'Actor not found'
    if (!actorAccess(identity, actor)) return 'Permission denied: not the actor owner'
  }

  return null
}

/**
 * May `identity` update/delete `existing` of `kind`?
 * `ctx.resolveTokenActor()` resolves a token's linked actor (may be null).
 */
export function denyMutate(kind, existing, identity, ctx) {
  let permitted
  if (kind === 'scene') {
    permitted = isDm(identity)
  } else if (kind === 'actor') {
    permitted = actorAccess(identity, existing)
  } else if (kind === 'item') {
    const actor = existing.actorId ? ctx.resolveActor(existing.actorId) : null
    permitted = actor ? actorAccess(identity, actor) : isDm(identity)
  } else if (kind === 'token') {
    const actor = ctx.resolveTokenActor?.() ?? (existing.actorId ? ctx.resolveActor(existing.actorId) : null)
    permitted = actor ? actorAccess(identity, actor) : ownRecord(identity, existing)
  } else {
    permitted = ownRecord(identity, existing)
  }
  return permitted ? null : 'Permission denied'
}

/* ── Ephemeral policy ───────────────────────────────────────────── */

/**
 * Allowlist of ephemeral types the server will relay.
 * Anything not listed is dropped (defense against arbitrary fan-out).
 * dmOnly types mutate table-wide state (scene activation, pulls).
 */
export const EPHEMERAL_POLICY = {
  'ping':                 { dmOnly: false },
  'ruler-update':         { dmOnly: false },
  'ruler-clear':          { dmOnly: false },
  'scene:user-presence':  { dmOnly: false },
  'scene:switched':       { dmOnly: true },
  'scene:move-all-users': { dmOnly: true },
}

export const EPHEMERAL_MAX_PAYLOAD_BYTES = 8 * 1024

/** Returns null if allowed, or a denial reason. */
export function denyEphemeral(payload, identity, rawByteLength) {
  if (!payload || typeof payload.type !== 'string') return 'Ephemeral requires a type'
  const policy = EPHEMERAL_POLICY[payload.type]
  if (!policy) return `Unknown ephemeral type: ${payload.type}`
  if (policy.dmOnly && !isDm(identity)) return 'Permission denied: DM only'
  if (rawByteLength > EPHEMERAL_MAX_PAYLOAD_BYTES) return 'Ephemeral payload too large'
  return null
}

/* ── Rate limiting ──────────────────────────────────────────────── */

/**
 * Token-bucket limiter. Defaults sized for ruler traffic throttled
 * client-side to ~30 Hz: 40 msgs/sec sustained, bursts to 80.
 */
export function createRateLimiter({ ratePerSec = 40, burst = 80 } = {}) {
  let tokens = burst
  let last = Date.now()
  return {
    /** true if the message may pass; false to drop it. */
    allow() {
      const now = Date.now()
      tokens = Math.min(burst, tokens + ((now - last) / 1000) * ratePerSec)
      last = now
      if (tokens < 1) return false
      tokens -= 1
      return true
    },
  }
}
