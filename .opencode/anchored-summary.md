## Goal
- Build a complete VTT system by implementing deployments, canvas features, and addressing spec gaps iteratively.

## Constraints & Preferences
- Cloudflare Pages project `hunt-website` is separate from GitHub Pages site `cdirkswager.github.io`; the active site URL is `https://hunt-website.pages.dev`
- Auth key management: use PEM secrets (`VTT_PRIVATE_KEY`, `VTT_PUBLIC_KEY`) as CF secrets rather than auto-generated KV keys, for deterministic keys across environments
- Existing site features (calendar, combat tracker, etc.) are NOT VTT features — VTT is a separate local game server using the site for auth only
- VTT data model: separate SQLite/JSON-file store (not existing D1)
- Real-time: WebSocket (separate from existing site's polling)
- Canvas: PixiJS-based rendering (separate from existing React map viewer)

## Progress
### Done
- Stage 1 — Cloud Auth Deployment: keypair generated (`secrets/vtt-private.pem`, `secrets/vtt-public.pem`); secrets set via `wrangler pages secret put VTT_PRIVATE_KEY` and `VTT_PUBLIC_KEY` on project `hunt-website`; site deployed at `https://hunt-website.pages.dev`; `GET /api/auth/vtt-jwks` returns valid JWKS; `POST /api/auth/vtt-token` returns 401 without session (correct)
- Stage 1 — `vtt-utils.js` updated: reads PEM secrets from `env.VTT_PRIVATE_KEY` / `env.VTT_PUBLIC_KEY` first (via `crypto.subtle.importKey` with `pkcs8`/`spki`), falls back to KV auto-generation
- Stage 1 — Local Server Config: public key PEM auto-detected at `mods/local-server/vtt-public.pem`; default `siteBaseUrl` updated to `https://hunt-website.pages.dev`
- Stage 3.2 — Walls & Doors (complete): `Wall.js` data model (5 types: solid, door, secret, see-through, terrain) with distance/intersection helpers; `WallLayer.js` PixiJS rendering (color-coded lines, door open/closed graphics, dashed secrets, hit testing); wall-draw tool + wall-select tool with keyboard shortcuts (P/T/W/S/Del) and grid snapping; demo walls forming a room with door, secret, see-through, and terrain
- Stage 3.3 — Lighting & Vision (all v4 spec gaps closed 2026-06-30):
  - `WallSpatialIndex` — uniform grid (200px cells), incremental rebuild, range-queried per token
  - `distToSegmentFast` — exported function, not side-effect assignment
  - Performance instrumentation (`perfStart`/`perfEnd`), used in `refreshLighting`
  - GM sees-all mode (`viewAll` flag, bypasses overlay entirely)
  - Darkvision (`darkvisionRange` on Token, computed as separate vision polygon)
  - Scene ambient light (`ambientLight` on Scene, scales overlay darkness alpha)
  - Union of player-owned tokens (`_viewpointTokenIds[]` array, all contribute vision polygons)
  - Fog of War seam (`onVisionChanged` callback fires on every recompute)
  - Client-masking caveat documented in both `LightingVision.js` and `LightingOverlay.js`
  - Overlay moved to stage-level container (not inside `sceneContainer`) to fix screen-space alignment during pan/zoom
  - Demo: GM View All toggle, ambient light slider, darkvision on Gloom token
  - Vitest test suite: 47 tests across geometry, blocking rules, integration, spatial index, FogOfWar
  - README with architecture, features, API docs, test info
- Stage 3.4 — Fog of War (initial build 2026-06-30):
  - `FogOfWar.js`: persistent explored-region accumulation via RenderTexture + ERASE blend
  - World-space polygon storage, re-projected to screen per frame
  - Integrates with `onVisionChanged` callback for automatic accumulation
  - Renders below lighting overlay in the overlay stack
  - `accumulate()`, `reset()`, `toJSON()`/`fromJSON()` for persistence
  - Demo: fog toggle button, reset button, F keyboard shortcut
  - 7 unit tests with pixi.js module mocking

### In Progress
- (none)

### Blocked
- (none)

## Key Decisions
- Use uniform grid (cell=200px) as spatial index over walls, rebuilt on wall change, queried per raycast to cull distant walls
- RenderTexture + ERASE blend for vision cutout, ADD blend for light sources
- All vision/light computation client-side from synced inputs — no server-side enforcement in this pass
- Client-side masking is visual-only, not a security boundary — documented
- Spatial index integrated as optional parameter to `computeCombinedVision` — backward compatible
- Darkvision uses same ERASE-blend pipeline as normal vision
- Overlay rendered outside sceneContainer to fix screen-space coordinate mismatch during pan/zoom
- Fog of War stores world-coordinate polygons, re-projects each frame: pan/zoom safe at the cost of per-frame re-render
- Fog of War uses same RT+ERASE pattern as LightingOverlay, rendered in a separate layer below lighting
- Tests use vitest with pixi.js mocked for FogOfWar tests (no DOM/WebGL required)

## Next Steps
1. Stage 4 — Dice Engine: formula parser, roller, result UI
2. Stage 2.5 — Data layer: VTT-specific SQLite/JSON-file store, scene CRUD
3. Stage 2 — Real-time server: WebSocket hub, state sync

## Critical Context
- `Wall._distToSegmentFast` was a side-effect assignment that broke under direct import — refactored to exported `distToSegmentFast()` function
- `NEAR_CLIP` was compared against parametric `t` instead of actual distance (`t * range`) — fixed
- `queryIndices` had a variable shadowing bug (loop variables shadowed function params) — fixed
- `Wall` constructor overrode explicitly-passed `doorState`/`hidden` — fixed to use provided values when given
- `wrangler pages secret put` requires `--project-name hunt-website`; secrets are per-environment
- Local server at port 3001; auto-detects PEM key at `mods/local-server/vtt-public.pem`

## Relevant Files
- `mods/vtt-canvas/src/LightingVision.js` — raycasting engine, spatial index, darkvision, perf instrumentation, Fog of War seams
- `mods/vtt-canvas/src/LightingOverlay.js` — PixiJS darkness/light rendering layer with viewAll and ambient light support
- `mods/vtt-canvas/src/FogOfWar.js` — persistent explored-region overlay using RT+ERASE pattern
- `mods/vtt-canvas/src/CanvasController.js` — orchestrates lighting refresh, spatial index, viewpoint array, GM mode, Fog callback
- `mods/vtt-canvas/src/CanvasRenderer.js` — overlay moved to stage-level container; fog layer below lighting
- `mods/vtt-canvas/src/Wall.js` — Wall data model (5 types), distance/intersection helpers
- `mods/vtt-canvas/src/Token.js` — Token with `darkvisionRange`, `centerX`/`centerY`
- `mods/vtt-canvas/src/Scene.js` — Scene with `ambientLight` field
- `mods/vtt-canvas/index.html` — demo with lighting toggle, ambient slider, fog toggle, GM view all, keyboard shortcuts (L, F, V, G, P, T, W, S)
- `mods/vtt-canvas/LIGHTING-VISION-ITERATION.md` — living document tracking gap fixes, performance measurements, and decisions
- `mods/vtt-canvas/README.md` — architecture docs, usage, API, test info
- `mods/vtt-canvas/src/LightingVision.test.js` — 40 tests: spatial index, ray intersection, polygon, blocking rules, vision/light, combined vision
- `mods/vtt-canvas/src/FogOfWar.test.js` — 7 tests: accumulate, reset, serialization
- `secrets/vtt-private.pem`, `secrets/vtt-public.pem` — generated RSA keypair for JWT signing
- `mods/local-server/vtt-public.pem` — copied public key for offline local server verification
