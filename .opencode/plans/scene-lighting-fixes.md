# Scene & Lighting Fixes — Living Document

## Goal
Fix scene duplication bugs and redesign VttScenePanel for compact scene management with proper lighting sync.

---

## Progress

### Done
- [x] Moved scene:created, scene:init-active, scene:switched, scene:user-presence, ephemeral, scene:deleted handlers before sync-bridge:ready in VttSyncBridge.js (so init replay events are caught)
- [x] Batched scenes-changed emit in ephemeral scene:move-all-users handler
- [x] Removed redundant emitRecord from SceneManager.moveAllUsersToScene
- [x] Created this living document

### In Progress
- [ ] Fix dead scene removal (switch away before remove) in VttSyncBridge scene:deleted handler
- [ ] Redesign VttScenePanel UI (compact, per-scene controls, expandable detail panel)
- [ ] Gate Lighting + Ambient controls behind isDm
- [ ] Run tests to verify 215 pass

---

## Key Bugs Found

### BUG A — Dead scene removal (HIGH)
**File**: `SceneManager.js:34-35`, `VttSyncBridge.js:446-448`

`sceneManager.remove()` silently refuses if `sceneId === this._activeSceneId`. When DM deletes a scene that's a player's active scene, the player's `scene:deleted` handler can't remove it. The dead scene persists, and any interaction with it triggers "record not found" errors from the server.

**Fix**: In `VttSyncBridge.js`, the `scene:deleted` handler should force-switch away from the deleted scene before calling `remove()`:

```js
unsubs.push(eventBus.on('scene:deleted', (data) => {
    if (!sceneManager) return
    if (sceneManager.activeScene?.id === data.id) {
        const other = sceneManager.scenes.find(s => s.id !== data.id)
        if (other) sceneManager.switchScene(other.id)
    }
    sceneManager.remove(data.id)
}))
```

### BUG B — Scene record-created messages lost before bridge setup (MEDIUM)
**File**: `VttSyncClient.js:158-161`

During the window between WebSocket connect and canvas mount, `record-created` broadcasts are silently dropped because the `scene:created` listener isn't registered yet. Partially mitigated by `init` replay on connect.

**Status**: Not addressed — low priority, small window.

### Handler reordering fix (already applied)
**File**: `VttSyncBridge.js`

Moved 6 event handlers before `sync-bridge:ready` so they catch init replay events. Without this, server scenes were never added to the player's sceneManager during init, breaking lighting sync (scene IDs never matched).

---

## UI Redesign: VttScenePanel

### Current Issues
- Scene list has scene name, user dots, and only a delete ✕ button
- Lighting/ambient controls not DM-only gated
- No per-scene lighting toggle from list
- No inline editing for name or map size

### Target Layout

#### Scene List Rows
```
[Scene Name (click to edit)] [user dots] [👁] [▶]
```

- **Scene name**: click turns into inline `<input>`, blur/Enter saves, Escape cancels
- **👁**: eyeball toggles `lightingEnabled` for that scene (emits `scene:updated`)
- **▶**: expand arrow replaces old ✕ delete button

#### Detail Panel (expanded via ▶, auto-collapses on scene switch)
Appears inline below the expanded scene row:
```
  Map Size:  [40] × [30]  (editable grid cells)
  Ambient Light:  [══════●══════]  {isDm}
  View from Token: [— None ▼]     {isDm}

  Grid                           {isDm}
  Unit per cell:  [5]
  Unit label:     [ft]
  ──────────────────────────────────
  [✕ Delete Scene]  (red button + confirm dialog)
```

### Implementation Details

**State additions**: `expandedSceneId` (null = none expanded), auto-collapse when `activeId` changes.

**Edit-in-place**: Click scene name → replace `<span>` with `<input>`. On blur/Enter, emit `scene:updated({ name })`. On Escape, revert.

**Eyeball toggle**: Calls `sceneManager.switchScene` if not active, then sets `lightingEnabled = !s.lightingEnabled` and emits `scene:updated({ id: s.id, lightingEnabled: next })`.

**Delete button**: At bottom of detail panel, styled red with `window.confirm("Delete [name]?")` before calling `handleDelete(s.id)`.

**Files to modify**: `VttScenePanel.jsx`, `VttPage.css` (if new styles needed).

### DM Gating
| Control | Gated |
|---------|-------|
| Scene name editing | No (visible to all, but server rejects non-DM writes) |
| Eyeball toggle | No (visible to all, shows current state; player changes may be rejected) |
| Map size editing | Yes (`{isDm && ...}`) |
| Ambient Light | Yes (`{isDm && ...}`) |
| View from Token | Yes (`{isDm && ...}`) |
| Grid & Ruler | Yes (`{isDm && ...}`) |
| Delete button | Yes (`{isDm && ...}`) |

---

## Critical Context
- `sceneManager.remove()` guard: `if (sceneId === this._activeSceneId) return`
- `_isLocalDefault` flag set on initial scene in `main.js:49`, not serialized by `Scene.toJSON()`
- `scene:created` handler has existence guard at `VttSyncBridge.js:425`
- `_hadServerScenes` set to `true` only when a genuinely new scene (not already in sceneManager) is processed
- Server has DM-only guards for scene create/update/delete (`websocket.js`)
- All existing tests must pass (215 total)
