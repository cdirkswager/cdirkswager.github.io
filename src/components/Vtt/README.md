# VTT Canvas Integration

## Overview

The VTT (Virtual Tabletop) feature wires the already-built PixiJS canvas and real-time spine into the live React site. It is a **separate, isolated feature** — it does not modify any existing pages or routes.

## How to Run

### 1. Start the local server (GM only)

The local-authoritative server runs as a separate Node.js process on the GM's machine:

```bash
cd local-server
npm install   # first time only
node src/index.js
```

By default it listens on `ws://localhost:3001`. The server will fetch its public key from the deployed site at startup (via `/api/auth/vtt-jwks`).

### 2. Open the VTT feature

Any logged-in user can navigate to `/vtt` on the deployed site. The existing login guard handles authentication — no separate login is needed.

### 3. Host a session (DM)

1. DM starts the local server (step 1 above).
2. DM navigates to `/vtt` and enters the server URL (e.g., `localhost:3001`).
3. DM clicks **"Register Server & Get Code"** — this creates a 6-character join code via the site's `/api/game/register` endpoint.
4. DM shares the code with players.

### 4. Join a session (Players)

1. Player navigates to `/vtt`.
2. Player enters the 6-character join code.
3. Player clicks **"Connect"**.
4. The site looks up the server URL via `/api/game/lookup/:code`, obtains a VTT token from `/api/auth/vtt-token`, and opens a WebSocket connection.

## Two-Profile Multiplayer Test

This is the headline acceptance test:

1. **Start the local server:** `cd local-server && node src/index.js`
2. **Open two browser profiles** (or incognito windows) pointing at the deployed site.
3. **Log in as different users** in each profile (one as DM, one as player — or both as players).
4. **DM:** Navigate to `/vtt`, register the server, note the join code.
5. **Player 1:** Enter the join code and connect.
6. **Player 2:** Enter the join code and connect.
7. **Verify:** Each user sees the other's token move in real time on the canvas.

## Existing Features Untouched

- The old `/map` page (`MapPage.jsx`) is unchanged.
- Calendar, DM tools, players, combat tracker — all work exactly as before.
- No existing routes, guards, or data modules were modified.
- The only shared-file edits are:
  - One new route in `App.jsx`: `<Route path="/vtt" element={<RequirePlayer><VttPage /></RequirePlayer>} />`
  - One new nav link in `Layout.jsx`: "VTT Canvas" (visible to all logged-in users)

## Architecture

```
Browser (logged-in user)
    │
    ├─ GET /api/auth/vtt-token ─→ Cloudflare Worker → signed JWT
    ├─ GET /api/game/lookup/:code ─→ Cloudflare Worker → server URL
    │
    └─ WebSocket ws://<server>:3001?token=<jwt>
            │
            ▼
    Local Server (Node.js, GM's machine)
        ├─ RS256 JWT verification (offline, cached JWKS)
        ├─ Permission enforcement (createdBy; dm bypasses)
        ├─ Record store (JSON files per type)
        └─ Broadcast to connected clients
```

## File Locations

- **Feature UI:** `src/components/Vtt/`
  - `VttPage.jsx` — connect panel + canvas container
  - `VttCanvasMount.jsx` — React wrapper for PixiJS canvas
  - `VttPage.css` — styles
- **Data module:** `src/data/vtt.js` — token, lookup, connector helpers
- **Canvas source:** `src/vtt/canvas/` — moved from `mods/vtt-canvas/src/`
- **Local server:** `local-server/` — moved from `mods/local-server/`
