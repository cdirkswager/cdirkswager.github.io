# VTT System Audit — July 2026

Scope: `src/components/Vtt/`, `src/vtt/canvas/`, `src/vtt/data/`, `local-server/`, and the sync protocol between them. The rest of the Player HUB (calendar, DM tools, downtime, etc.) is treated as out of scope per the siloing described in the project docs. Note: `mods/Project-State-Primer.md` was not present in the uploaded zip; `MODS-PROGRESS.md`, the Master Build Plan, and the Vtt README were used as the project-state reference instead.

---

## Part 1 — Post-mortem: "Move all users" breaks the session

### Symptom
DM clicks **Move all users here** on the Scene panel. With no players connected, nothing bad happens. With one or more players connected, the session freezes / everything breaks.

### Root cause: an ephemeral echo loop in `VttSyncClient`

The record sync path (`record-created` / `record-updated` / `record-deleted`) correctly wraps its local re-emit in a `_sending` guard so the client's own outbound subscriber ignores it. The ephemeral path did not:

```js
// VttSyncClient._onMessage — BEFORE
case 'ephemeral':
  this.eventBus.emitEphemeral(msg.payload.type, { ...msg.payload, fromUserId: msg.userId, ... })
  break

// VttSyncClient._onEphemeral — BEFORE (subscribed to ALL 'ephemeral' bus events)
_onEphemeral(e) {
  if (this.ws && this.ws.readyState === WebSocket.OPEN) {
    this.ws.send(JSON.stringify({ type: 'ephemeral', payload: e }))
  }
}
```

Every ephemeral arriving from the network was re-emitted on the local bus, where the client's own `_onEphemeral` subscriber immediately re-sent it to the server. The server broadcasts ephemerals to everyone except the sender, so:

- **DM alone (0 players):** broadcast reaches nobody → no echo → "works fine."
- **DM + 1 player:** the message ping-pongs between the two clients forever, at localhost round-trip speed (thousands of messages per second).
- **DM + 2+ players:** each hop multiplies by (N−1) recipients, each of whom echoes → **exponential message explosion**. Server and every client saturate within seconds.

`Move all users here` is simply the first ephemeral your group exercised in multiplayer. The same loop applies to **every** ephemeral: `scene:switched`, `ping`, `ruler-update`, `ruler-clear`, `scene:user-presence`. Scene switching with players connected, or dragging a ruler in a multiplayer session, would have detonated the same way.

### Compounding bugs found on the same path

1. **`scene:user-presence` listener never fired for remote messages.** The bridge subscribed via `eventBus.on('scene:user-presence', ...)`, but network ephemerals are always re-emitted under the `'ephemeral'` event with a `type` field. Dead listener → `sceneManager.userScenes` never learned about remote users.
2. **Presence never populated.** `VttPage` polled `fetch('/api/presence')` — a *site-origin* relative URL. Presence lives on the DM's *local game server* (`local-server/src/index.js` line 43), a different origin entirely. The fetch 404'd and was silently swallowed. Meanwhile the server *does* push a `{ type: 'presence' }` WebSocket message on every connect/disconnect — and `VttSyncClient._onMessage` had no case for it, so it was silently dropped. Net effect: `connectedUsers` was always `[]`, so the Scene panel's user dots never rendered and `userScenes` never got seeded.
3. **Move-all mutated private state silently.** The remote handler wrote `sceneManager.userScenes.set(...)` directly on the private map without emitting `scenes-changed`, so even in a working world the panel would not have re-rendered.

Because of (1) and (2), `moveAllUsersToScene` on the DM iterated an essentially empty map (no local effect) and then fired the ephemeral that triggered the echo storm — which is exactly the "does nothing alone, breaks everything with users" signature you reported.

### The fix (implemented, all 221 tests pass, 6 new regression tests added)

- **`src/vtt/canvas/VttSyncClient.js`**
  - Incoming ephemerals are now emitted inside the same `_sending` guard the record path uses.
  - `_onEphemeral` additionally refuses to send anything carrying a `fromUserId` stamp (defense in depth if emit ever becomes async).
  - New `case 'presence'`: server presence pushes are surfaced on the bus as a `'presence'` event, cached, and replayed on `sync-bridge:ready` so late-mounting UI catches the initial push.
- **`src/components/Vtt/VttSyncBridge.js`**
  - `scene:user-presence` handling moved into the `'ephemeral'` handler where those messages actually arrive.
  - The move-all handler reassigns users via `setUserScene` (fires `scenes-changed`), and also registers *this* client's own `userId` on the target scene so presence works even when seeding failed.
- **`src/components/Vtt/VttPage.jsx`**
  - Removed the broken same-origin `/api/presence` polling; `connectedUsers` now subscribes to the bus `'presence'` event fed by the WebSocket push.
- **New tests:** `src/vtt/canvas/VttSyncClient.test.js` (echo-loop regression, origin stamping, presence caching) and two new cases in `VttSyncBridge.test.js` (remote move-all, presence-on-ephemeral-channel).

### How to verify manually
Start the local server, connect DM + one player in two browser profiles, open DevTools → Network → WS on both. Click **Move all users here**. Expected: exactly one `ephemeral` frame leaves the DM, one arrives at the player, the player switches scenes, and traffic goes quiet. Before the fix, the WS frame log scrolls endlessly.

---

## Part 2 — Architecture assessment

### What is genuinely good

- **The layering concept is right.** Pure data models (`Scene`, `Token`, `Wall`, `Item`, `Actor`) with `toJSON`/`fromJSON`, a Pixi rendering layer, an input controller, and a React shell that only orchestrates. This is the same shape Foundry itself uses and it will scale.
- **Server-side validation is real.** `websocket.js` enforces ownership, equip-slot legality, container capacity, cycle prevention, and attunement limits *on the server*, not just the client. Most hobby VTTs skip this entirely.
- **Optimistic updates with opId rollback** in the item pipeline (`_pendingOps` + `sync-error` → snapshot restore) is a professional pattern, correctly implemented, and tested.
- **Lighting is performance-conscious already:** wall spatial index with `rebuildIfNeeded`, microtask-coalesced `invalidateLighting()`, dirty-flag deferral of raycasts to pointer-up during token drags, rAF-throttled ambient slider in the panel, `perfStart/perfEnd` instrumentation, and a `benchmark.js`. Token drags do *not* recompute vision per mousemove — good.
- **Auth design is sound:** RS256 JWT minted by the site, verified offline by the local server via cached JWKS. The local server never needs site credentials.
- **Test coverage where it matters:** 221 passing tests, concentrated on the tricky logic (lighting geometry, measurement, weight/containers, effect engine, sync bridge optimistic ops).

### The core design flaw: one bus, no direction, no origin

Almost every sync bug in this codebase — including the one you hit — comes from a single decision: **local UI events and network sync share one `EventBus` with no envelope describing who emitted a message or where it should go.**

Consequences visible in the code today:

- `VttSyncClient` must guess which bus traffic is outbound vs. inbound, using a `_sending` boolean flipped around synchronous emits. The record path remembered the guard; the ephemeral path forgot it → the echo storm. Any future contributor adding a new inbound re-emit will make the same mistake, because nothing in the type of the event says "this came from the network."
- The bridge's `'ephemeral'` handler runs for the DM's *own* outbound emits too (harmless today only because `switchScene` early-returns on same-id — a fragile accident, not a design).
- `SceneManager.switchScene` emits `'scene:switched'`, and the bridge listens to `'scene:switched'` and calls `switchScene` — a re-entrant cycle that only terminates because of the same-id guard.

**Recommendation (highest-leverage refactor in the codebase):** give every bus message an explicit envelope, e.g. `{ origin: 'local' | 'remote', type, payload }`, or split into two buses (`modelBus` for canvas-internal notifications, `netBus` for the sync boundary) with one adapter between them. Then the rules become mechanical: the sync client sends only `origin:'local'`, and re-emits network traffic as `origin:'remote'`; UI/bridge handlers can subscribe to either or both intentionally. Every `_sending` flag and `fromUserId` check disappears. This is a ~1-day refactor that removes an entire bug class before you add chat, pings-for-real, fog sync, dice, and cursors — all of which ride this exact channel.

### Second design flaw: the bridge monkey-patches instead of composing

`VttSyncBridge` attaches ~18 methods onto `controller` (`equipItem`, `transferItem`, `dropItem`, ...) and **replaces `sceneManager.moveAllUsersToScene` at runtime**, restoring the original in the destroy function. Problems:

- Behavior depends on *whether and when* the bridge ran. `VttScenePanel.handleMoveAll` calls `sceneManager.moveAllUsersToScene(activeId)` and gets network sync only if the patch is installed. If mount ordering ever changes (it already has a `handleCanvasReady`/effect race surface), the button silently becomes local-only.
- `destroySyncBridge` nulls out controller methods (`controller.getItem = null`), so any UI callback that fires during teardown crashes on `null is not a function` instead of no-oping.
- The 530-line bridge is now the de facto "application layer" but reads as glue.

**Recommendation:** promote the intent API to a first-class module — a `GameActions` (or `commands.js`) object created once, injected into React via context/props, that owns optimistic-apply + emit + rollback. `CanvasController` goes back to being input handling only. The Scene panel calls `actions.moveAllUsers(sceneId)` and it is *always* the synced version. This also gives you one obvious place to add the dice, chat, and targeting verbs coming in Stages 4–5.

### Third design flaw: two contradictory scene models, half-implemented each

The code contains both:

- **Per-user scenes:** `SceneManager.userScenes` (user → scene map), user dots per scene row, `getUsersOnScene`, `scene:user-presence`.
- **One global scene:** the `scene:switched` ephemeral force-switches *every* connected client, and the server tracks a single `_activeSceneId` that new joiners snap to.

They fight each other: the moment anyone switches scenes, every client follows, making `userScenes` meaningless. Worse, `handleSwitch` in the Scene panel is **not DM-gated** — clicking a scene row is available to players (the row renders for everyone), and that click broadcasts `scene:switched`, so *any player can yank the whole table to another scene*.

**Recommendation:** pick the model explicitly (Foundry's is a good target: DM sets the *active* scene; individual users may *view* other scenes locally; "pull all players" is a DM verb). Concretely:

1. Local scene viewing = local only, no broadcast.
2. `scene.activate` and `scene.pullAllUsers` = DM-only, permission-checked **on the server** (today the server relays any ephemeral from any user with zero checks — a player could emit `scene:move-all-users` by hand).
3. The server owns the user→scene map. Clients report `scene:user-presence` when they switch; the server stores it and includes it in `init`, so the DM's panel is correct after a refresh. Today `userScenes` lives only in each client's RAM and diverges.

### Server-side issues

- **Ephemerals bypass all permissions.** Records are carefully permission-checked; `case 'ephemeral'` relays anything to everyone and even lets any client mutate `_activeSceneId` (durable-ish state changed via a "transient" channel). Add a small allowlist: which ephemeral types exist, who may send each, max payload size, and a per-connection rate limit. The rate limit alone would have turned the echo storm from "session-ending" into "log noise."
- **Duplicate `case 'split-stack'`** in the `handleMessage` switch (lines ~414 and ~498). The second is unreachable dead code — delete it before the copies drift apart.
- **`_currentOpId` is shared mutable state** across all connections inside `handleMessage`/`_deny`. Two interleaved messages can attach the wrong opId to an error, rolling back the wrong client's optimistic op. Pass `opId` as a parameter to `_deny` everywhere (half the call sites already do).
- **`websocket.js` is a 550-line switch** mixing routing, per-kind permissions, domain validation, persistence, and broadcast. Extract a `permissions.js` table (kind × action → rule) and per-kind handlers. This is the file that grows with every new record type; make growth cheap now.
- **Init payload will not scale:** `init` ships *every record of every type* ever stored, including items of actors on other scenes and (eventually) fog data. Fine for one party; plan a per-scene lazy load before maps get image-heavy.

### React layer

- **`VttCockpit.jsx` (792 lines) contains ~8 embedded components** (token creator, token list, editors, actor manager, background uploader...). Split by feature folder like you already did for `inventory/` — that folder is the pattern to copy (small components + a `useInventoryModel` hook + pure tested helpers).
- **Repeated mutate-then-emit boilerplate.** `VttScenePanel` does `Object.assign(scene, changes); emitRecord(...); setScenes([...])` in six handlers. One `updateScene(sceneId, changes)` action (see `GameActions` above) removes the duplication and guarantees model, network, and React state can't diverge.
- **`scenes-changed` is a firehose.** Every `setUserScene` re-clones the scene array and the userScenes map into React state. Harmless at 5 users/10 scenes, but the event carries no payload — consider `scenes-changed` vs `user-scene-changed` granularity when presence gets chatty.
- **`VttConnector.connect` polls its own state every 200 ms** to resolve a promise instead of resolving directly from the `onAuthenticated`/`onAuthError` callbacks. Trivial cleanup, removes a timer.
- **`VttErrorBoundary` catches render errors only.** Pixi/controller errors are thrown from event handlers and async code, which boundaries never see (the controller's own try/catch around pointer handlers is doing the real work — good). Consider surfacing `sync-error`s without opIds to a toast; today they only hit the console.

---

## Part 3 — Performance review

Ordered by real-world impact:

1. **Ruler broadcasts per pointermove, unthrottled** (`RulerLayer.updateEndpoint` → `_broadcast()`), and each message triggers JSON stringify → WS → server → JSON parse → broadcast → N× parse → redraw. At 120 Hz pointer rates with 4 players this is ~500 msgs/sec server-side for one ruler drag. Throttle outbound ruler/cursor-class ephemerals to rAF or a fixed 20–30 Hz tick, sending only the latest state (coalesce, don't queue). This matters *now*, and doubly so before shared cursors land.
2. **`key-store.js` does a synchronous, pretty-printed, whole-file rewrite on every mutation.** A token drag-end rewrites `token.json` with `JSON.stringify(records, null, 2)` on the server's only thread, blocking every connected socket for the duration. With hundreds of items this becomes multi-ms stalls per drag. Fix cheaply: (a) drop `null, 2`; (b) debounce saves per kind (e.g., flush 250 ms after last write, plus on shutdown); (c) write-temp-then-rename for crash safety. The store's interface is already swappable — this fits inside it.
3. **`getById`/`update` are O(n) array scans** per message. Keep the array for persistence but maintain a `Map<id, record>` per kind. One-line change in `_loadIndex`, pays for itself once item counts grow.
4. **Tile create/delete calls `renderer.loadScene(scene)`** — a full scene teardown/rebuild (all tokens, walls, lighting) to add one tile. Add incremental `addTile`/`removeTile` on the renderer like tokens already have. Same for the background-swap path in the cockpit.
5. **Lighting is in good shape** — keep the discipline. Two watch items: `refreshLighting` is called 3× in a row during `switchScene`/bridge-init sequences (`refreshLighting` + two `syncViewpoint*` calls that each trigger it); route those through `invalidateLighting()` so the microtask coalesces them. And the 1° ray granularity is a fixed 360-ray floor regardless of wall count — fine today, but the corner-refinement approach means you could drop the uniform sweep substantially on sparse maps.
6. **Init replay emits one bus event per record** with full handler fan-out (each token: viewpoint sync ×2 + lighting invalidate). The microtask coalescing saves the lighting cost; consider a `bulk-load` path that hydrates the scene silently and emits one `scene:loaded` when record counts reach the hundreds.
7. **React re-render pressure is low today** because most canvas state stays out of React — good instinct. Preserve it: keep high-frequency data (drag positions, ruler points, vision polygons) on the Pixi side and only notify React on discrete changes.

---

## Part 4 — Scope & roadmap guidance

Against the Master Build Plan (Stages 4–7 mostly unstarted), the features that will lean hardest on today's weak points:

| Upcoming feature | Depends on | Do first |
|---|---|---|
| Pings & shared cursors | ephemeral channel | origin envelope (Part 2 §1) + ephemeral throttle/rate-limit |
| Chat & dice | intent/verb layer, server validation | `GameActions` module + `permissions.js` extraction |
| Fog of war | per-scene data volume, init payload | per-scene lazy record loading |
| Scene navigation & management | scene model | resolve per-user vs global scene semantics |
| Show-to-players / targeting | ephemeral permissions | server-side ephemeral allowlist |

Suggested order of operations (each item is small, and each removes a bug class rather than a bug):

1. ✅ **Done in this pass:** ephemeral echo fix, presence plumbing, user-scene tracking on the correct channel.
2. **Origin envelope / bus split** (~1 day). Delete `_sending` entirely.
3. **Server ephemeral allowlist + rate limit + DM-gating for scene verbs** (~half day). Also delete the duplicate `split-stack` case and thread `opId` explicitly.
4. **`GameActions` module** replacing controller monkey-patching (~1–2 days, mostly mechanical moves out of `VttSyncBridge`).
5. **Key-store debounced writes + Map index** (~half day).
6. **Decide the scene model** and make the server own user→scene state (design conversation first, then ~1 day).
7. **Split `VttCockpit.jsx`** opportunistically as each panel is next touched.

One documentation note: `mods/Project-State-Primer.md` is referenced as the project overview but isn't in the repo zip (only `MODS-PROGRESS.md` and the build-plan docs are). If it exists elsewhere, commit it next to the others; if it's aspirational, `MODS-PROGRESS.md` is currently doing its job and just needs the Stage 3 rows updated (scene navigation/management and pings are further along than "Not started").

---

## Appendix — Files changed in this pass

| File | Change |
|---|---|
| `src/vtt/canvas/VttSyncClient.js` | `_sending` guard on incoming ephemerals; `fromUserId` send-refusal; `presence` message handling with cache + replay |
| `src/components/Vtt/VttSyncBridge.js` | presence handling moved to the `'ephemeral'` channel; move-all uses `setUserScene` and registers self |
| `src/components/Vtt/VttPage.jsx` | presence via WS push instead of wrong-origin HTTP polling |
| `src/vtt/canvas/VttSyncClient.test.js` | **new** — echo-loop regression, origin stamping, presence cache tests |
| `src/components/Vtt/VttSyncBridge.test.js` | 2 new cases: remote move-all, presence-on-ephemeral |

Full suite: **19 files, 221 tests, all passing.**
