# VTT Refactor — Implementation Notes (July 2026)

Companion to `VTT-System-Audit.md`. Every recommendation from the audit has been implemented. Verification status at the end of the work:

- **Unit suite:** 22 files, **253 tests, all passing** (was 221 — net +32 covering the new modules)
- **E2E acceptance (`local-server/test/acceptance.test.js`):** **22/22 passing** against the refactored server
- **E2E inventory (`local-server/test/inventory-acceptance.test.js`):** **21/21 passing**
- **Production build (`vite build`):** clean

---

## 1. Origin envelope on the EventBus (audit: "the core design flaw")

`EventBus.emitRecord(resource, action, data, opId, origin = 'local')` and `emitEphemeral(type, payload, origin = 'local')` now stamp every message with where it came from. The contract:

- `origin: 'local'` — produced on this client. `VttSyncClient` forwards these to the server.
- `origin: 'remote'` — received from the network. The sync client **never** forwards these back; the bridge applies them to the canvas.

`VttSyncClient` re-emits all inbound records and ephemerals with `origin: 'remote'` (init replay included) and its outbound subscribers check the field. The `_sending` boolean is **deleted from the codebase** — the mechanism that caused the echo-loop bug class no longer exists to be forgotten. `fromUserId` stamping is retained as defense in depth and for display attribution (PingLayer).

A `net:send` bus channel was added for raw server verbs that aren't record CRUD (currently `create-loot-pile`).

## 2. GameActions command layer (audit: "stop monkey-patching")

New module: **`src/vtt/GameActions.js`** — `createGameActions({ canvas, eventBus })` returns the full verb set:

- **Items:** `equipItem`, `unequipItem`, `moveItem`, `transferItem`, `splitStack`, `setAttunement`, `setIdentified`, `deleteItem`, `dropItem`, `createLootPile` — including the optimistic-apply/opId/rollback machinery, moved wholesale from the bridge.
- **Scenes:** `viewScene`, `activateScene`, `pullAllUsers`, `createScene`, `deleteScene`, `updateScene` — `updateScene` is the single home for the mutate-then-emit pattern that was previously copy-pasted across six panel handlers.

`VttSyncBridge` is now **inbound-only** (~330 lines, was 530): it applies remote events and wires the controller's outbound gesture callbacks. It attaches **zero** methods to the controller and no longer patches `sceneManager.moveAllUsersToScene`. Its `destroy` replaces gesture callbacks with no-ops instead of `null` so late-firing pointer events during teardown can't crash.

`VttPage` creates/destroys the actions object alongside the bridge and passes it down as an `actions` prop. All UI call sites migrated: `VttCockpit`, `VttScenePanel`, `InventoryScreen`, `ItemGrid`, `LootPanel`.

**Bonus bug fixed by this move:** drop-to-ground was mis-wired. The cockpit called `controller.createLootPile({ x, y, fromItemId, name })` against a `(name, seedItems)` signature — producing an unplaced pile literally named `[object Object]` and ignoring the item seed. `GameActions.createLootPile` now routes the object form to the server's existing `create-loot-pile` verb (atomic pile + map token + item transfer, server-validated) via `net:send`; the legacy string form (`createLootPile('Loot')`) is preserved for the loot panel.

## 3. Scene model resolved (audit: "two contradictory models")

Foundry-style semantics, implemented end to end:

| Verb | Who | Effect |
|---|---|---|
| `viewScene(id)` | anyone | Switches **this client only**; announces presence |
| `activateScene(id)` | DM row-click | Everyone follows; server updates `activeSceneId` |
| `pullAllUsers(id)` | DM button | Moves every connected user |
| scene portals | the user who clicked | **Local view only** (previously yanked the whole table) |

The Scene panel routes DM row-clicks to `activateScene` and player row-clicks to `viewScene`. Every switch (local, activation, or being pulled) emits a bounded `scene:user-presence` for **self only** — the old bridge init incorrectly broadcast presence *for other users* from its own local map.

**The server now owns the user→scene map.** It updates on presence announcements (forcibly re-keyed to the sender's identity — a client cannot spoof another user's location), on DM activations, and on pulls; it prunes on disconnect. Every `presence` roster push includes `sceneId` per user, and the bridge syncs `sceneManager.userScenes` wholesale from that roster (seeding, updating, pruning). The panel's old guess-seeding effect is gone. The user dots on scene rows are now correct across refreshes and multi-scene play.

## 4. Server hardening (audit: ephemeral permissions, opId, dead code)

New module: **`local-server/src/permissions.js`**:

- `denyCreate` / `denyMutate` — the kind × action permission table, extracted from the two 30-line inline blocks in `websocket.js` (which is now a thinner router).
- `EPHEMERAL_POLICY` — an **allowlist**: `ping`, `ruler-update`, `ruler-clear`, `scene:user-presence` (anyone); `scene:switched`, `scene:move-all-users` (**DM only**). Unknown types are dropped. Previously any client could relay any ephemeral to everyone — including forging a table-wide scene pull.
- `denyEphemeral` — allowlist + DM gate + **8 KB payload cap**.
- `createRateLimiter` — per-connection token bucket (40 msgs/sec sustained, burst 80; sized for 30 Hz ruler traffic). Floods are silently dropped. Even if a future echo-style bug shipped, the server would now contain it instead of melting.

Also: the unreachable duplicate `case 'split-stack'` is deleted; the cross-connection `_currentOpId` shared mutable is gone — `opId` is threaded explicitly through every denial path, so a rejection can never roll back the wrong client's optimistic op.

## 5. Key-store performance (audit: sync whole-file rewrites, O(n) reads)

`local-server/src/key-store.js` rewritten, same public API:

- **O(1) reads:** each kind keeps a `Map<id, record>` beside the persistence array.
- **Debounced writes:** mutations mark the kind dirty; flush happens 250 ms after the last mutation instead of a synchronous pretty-printed whole-file rewrite per message on the server's only thread.
- **Atomic persistence:** write `<kind>.json.tmp`, then rename. Compact JSON (no `null, 2`).
- **`flush()`** exported; `index.js` flushes on SIGINT/SIGTERM.

One regression was caught by the E2E suite and fixed during the work: `getAllTypes()` must enumerate the union of on-disk **and in-memory** kinds, or a kind created since the last flush would be missing from init payloads sent to new joiners.

## 6. Remaining performance items

- **Ruler broadcasts throttled to ~30 Hz** with a trailing send (`RulerLayer._broadcast`), so the final position always goes out. Previously one ephemeral per pointermove (120+/sec), each a full stringify → relay → N× parse round trip.
- **Incremental tiles:** `CanvasRenderer.addTile` / `removeTile`. The bridge's `tile:created`/`tile:deleted` handlers, the background-upload panel, and the `canvas.addTile` facade no longer call `loadScene()` (full grid/walls/tokens/lighting teardown) to place one sprite.
- **Coalesced lighting:** `setViewpoint` and `SceneManager.switchScene` route through `invalidateLighting()` (microtask-batched), collapsing the 3 back-to-back raycasts a scene switch used to trigger into one.
- **`VttConnector.connect`** resolves from the auth callbacks directly; the 200 ms state-polling interval is gone.

## 7. VttCockpit split (audit: 792-line file)

`VttCockpit.jsx` is now a **199-line shell**. Panels moved to `src/components/Vtt/cockpit/` following the existing `inventory/` pattern:

- `AddTokenModal.jsx` · `TokenPanel.jsx` (incl. `TokenPropEditor`) · `BackgroundPanel.jsx` · `ActorPanel.jsx` (incl. `ActorDetail`)

## 8. Protocol / behavior changes to be aware of

1. **Non-DM `scene:switched` / `scene:move-all-users` are now rejected by the server.** Players can no longer yank the table; their scene clicks are local views.
2. **Unknown ephemeral types are dropped.** When you add pings-v2 / cursors / chat typing indicators, register the type in `EPHEMERAL_POLICY` first.
3. **Presence users carry `sceneId`.** Old clients ignore the extra field; new clients rely on it.
4. **Persistence is flush-based.** Data written in the last ~250 ms before a `kill -9` can be lost; SIGINT/SIGTERM flush cleanly. (The E2E restart test passes under SIGTERM.)
5. Scene portals move only the clicking user.
6. `local-server/src/**` unit tests now run in the main vitest suite; `local-server/test/**` are standalone Node E2E scripts (`node test/acceptance.test.js`), excluded from vitest, with the private-key path fixed to find the repo `secrets/`.

## 9. New/updated test coverage

| File | Covers |
|---|---|
| `src/vtt/GameActions.test.js` (new, 17) | item verbs + rollback (migrated), loot-pile routing incl. the drop-to-ground fix, scene verbs, destroy semantics |
| `src/components/Vtt/VttSyncBridge.test.js` (rewritten, 9) | inbound record application, remote-only ephemeral handling, origin filtering, presence roster seed/update/prune, safe teardown |
| `src/vtt/canvas/VttSyncClient.test.js` (4) | echo-loop regression via origin, presence cache/replay |
| `local-server/src/permissions.test.js` (new, 10) | create/mutate rules, ephemeral allowlist + DM gates + size cap, rate limiter |
| `local-server/src/key-store.test.js` (new, 10) | index consistency, debounce, coalescing, atomic rename, reload |

## 10. What was intentionally left alone

- `TokenPanel.handleSave` still uses one `loadScene()` for token property edits (width/src changes need a sprite rebuild; token edits are rare DM actions). Candidate for an incremental `updateTokenSprite` later.
- `InventoryScreen` receives a dead `onDropToGround` prop (pre-existing; drop routes through ItemGrid → `actions.dropItem`).
- The init payload still ships all records of all types; per-scene lazy loading remains the flagged pre-fog-of-war task.
- Bundle-size warning from Vite (662 kB chunk) — pre-existing; code-splitting the VTT route is a future task.
