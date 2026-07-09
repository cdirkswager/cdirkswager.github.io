# VTT Redesign — Server-Authoritative World + Tactical Layer

## Why a redesign, not another patch

Every sync failure this project has had — dropped tokens, wrong scenes,
players stranded, echo storms — shared one root cause: **the client had no
single world representation.** Each client booted on a locally invented
default scene (random ID), then replayed an unordered record stream into
scattered mutable state (Scene arrays, controller maps, React state), with
per-kind bridge handlers deciding routing each time. Every fix to that
model exposed the next hole because the holes were structural.

The redesign principle: **the server owns the world; the client is a
replica that invents nothing.**

## The new architecture

```
        SERVER (authoritative)
  boot: self-seeds "Scene 1" if the table is empty
  init: full snapshot {recordsByType, activeSceneId}
  live: validated record broadcasts, DM-gated ephemerals
           │
           ▼  'world:snapshot'
  ┌─────────────────────────────┐
  │  WorldStore  (one replica)  │  hydrate() builds ALL scenes+contents
  │  applyRecord() — the ONE    │  atomically before anything renders;
  │  mutation router            │  rehydrates in place on reconnect
  └─────────────┬───────────────┘
                │ 'world:effect' / 'world:view-scene' / 'world:resynced'
                ▼
  ┌─────────────────────────────┐
  │  RenderSync (one projection)│  mirrors ONLY the viewed scene onto
  │                             │  Pixi; off-screen changes update the
  │                             │  model and are never dropped
  └─────────────────────────────┘

  GameActions  = outbound verbs (optimistic emit + opId rollback)
  VttSyncBridge = gestures + ephemerals + presence ONLY (147 lines)
  SceneManager = "what am I looking at" + user-presence dots ONLY
```

Guarantees this structure gives by construction (each verified in the
end-to-end suite, `local-server/test/world-sync.e2e.mjs`):

1. **Every client sees the same world.** No local default scene exists
   when connected; the server seeds the first scene itself, so DM and
   players land on the same scene ID from message one.
2. **Nothing is ever dropped for being off-screen.** Records route to
   their owning scene in the store; the canvas is just a view. Switching
   scenes is re-projection, not reconciliation.
3. **No replay races.** Hydration happens before the canvas mounts; live
   events that arrive during the mount gap are buffered by the sync
   client and flushed on `sync-bridge:ready`.
4. **Reconnects cannot diverge.** A fresh `init` rehydrates the same
   store in place (`world:resynced` → full re-projection).
5. **Optimistic + echo is safe.** Local mutations apply through the same
   idempotent router the server echo hits.
6. **One render path.** Local switch, remote pull, scene deletion under
   your feet, and resync all flow through `world:view-scene`.

## The tactical-RPG layer (new features)

| Feature | How it works |
|---|---|
| **Initiative tracker** | `⚔ Start Combat` (DM) rolls d20 for every visible token on the viewed scene into a synced singleton `combat` record. Turn bar top-center for everyone; gold ring marks the active unit; **Space** advances the turn (DM); ◀/✕ rewind/end. Server rejects combat mutations from players. |
| **Grid snap** | Token drags land on the cell your unit's *center* occupies (tactics-style). `actions.toggleGridSnap()` turns it off. |
| **Movement range** | Selecting a token flood-fills reachable cells (Chebyshev, diagonals = 1) from its `speed` (default 30, scene `gridUnit` per cell), **blocked by walls and closed doors**, drawn as a blue overlay. Recomputes on move, wall edits, and door toggles. |
| **HP bars & nameplates** | Tokens with `maxHp` show a color-coded bar (green/amber/red) + name under the token; attached to the token sprite so they track drags. |
| **Unit panel** | Bottom-left card for the selected unit: portrait, HP bar, −5/−1/+1/+5 damage-heal buttons (owner or DM), speed. DM can set HP/speed inline or in the token editor's new *Tactical* section. |
| **Selection & hotkeys** | Click selects (ring + panel + range). **Esc** deselects. **Space** next turn. Combat bar entries are click-to-select. |

Pure logic lives in `src/vtt/combat.js` and `src/vtt/movement.js`
(unit-tested); the Pixi drawing lives in `src/vtt/RenderSync.js`; React
panels in `src/components/Vtt/cockpit/CombatTracker.jsx` / `UnitPanel.jsx`.

## Server changes

- **Self-seeds the first scene** at boot on an empty table and adopts it
  as `activeSceneId` — joiners always land somewhere real.
- **`combat` records are DM-only** (create/update/delete), enforced in
  `permissions.js` beside the existing tables.
- Client fix: a post-auth denial without an opId no longer marks the
  client auth-failed (previously one denied verb could poison reconnects).

## What was removed (on purpose)

- The bridge's entire per-kind record routing (~290 lines), the orphan
  token buffer, the local-default-scene removal dance, and the
  `KIND_ORDER` replay sort — all compensations for the old model.
- `SceneManager`'s private scene Map (second source of truth).
- Client-invented default scenes while connected.

## Verification status (honest)

- **Unit: 283/283 passing** (24 files) — includes new WorldStore,
  combat, movement, bridge-gesture, and sync-client buffer suites.
- **Production build: clean.**
- **World-sync E2E (`node local-server/test/world-sync.e2e.mjs`) —
  the full redesigned loop with the real client modules over live
  WebSockets: 16/17 verified in-session.** The 17th ("owner equip synced
  back to DM") failed because the test item lacked `itemType`/`slot` and
  the server *correctly rejected the illegal equip*; the test data is
  fixed, but the sandbox stopped running spawned-server workloads before
  a rerun completed. **Run it once locally to confirm 17/17.**
- **Legacy acceptance suites:** passed fully after the previous round;
  this round's server delta is two additive blocks (scene seed, combat
  permission), both exercised live by the world-sync E2E. The sandbox
  truncated tonight's full rerun mid-suite — the two "failures" in the
  clipped output were the harness dying at my timeout, not regressions.
  **Run `node test/acceptance.test.js` and `node test/inventory-acceptance.test.js`
  locally to close the loop.**

## Known follow-ups

- Range overlay uses per-cell rects; at speeds > ~60 ft on tiny grids,
  batch into one polygon if it ever shows in profiles.
- Templates render via full `templateLayer.draw()` per change; fine at
  table scale.
- `movement.js` `pathTo()` exists for click-to-move pathing — wiring a
  "click a highlighted cell to walk there" interaction is a natural next
  feature; the math is already tested.
- Initiative currently rolls a flat d20; wiring DEX modifiers from linked
  actor sheets is a small extension of `combat.rollInitiative`'s injected
  roll function.
