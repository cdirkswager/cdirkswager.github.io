import { useState, useRef, useCallback, useEffect } from 'react'
import InventoryScreen from './inventory/InventoryScreen.jsx'
import LootPanel from './inventory/LootPanel.jsx'
import PartyPanel from './inventory/PartyPanel.jsx'
import { useWindowStack, useVttHotkeys } from './inventory/windowStack.js'
import VttTopBar from './VttTopBar.jsx'
import VttHud from './VttHud.jsx'
import VttScenePanel from './VttScenePanel.jsx'
import AddTokenModal from './cockpit/AddTokenModal.jsx'
import TokenPanel from './cockpit/TokenPanel.jsx'
import BackgroundPanel from './cockpit/BackgroundPanel.jsx'
import ActorPanel from './cockpit/ActorPanel.jsx'
import './vtt-theme.css'

/**
 * VttCockpit — the in-session shell: top bar, HUD, side panels, and
 * game-window stack. Individual panels live in ./cockpit/ (same pattern
 * as ./inventory/); this file only orchestrates them.
 */
/* ── Main cockpit ──────────────────────────────────────────── */
export default function VttCockpit({ canvas, actions, eventBus, scene, isDm, session, connectedUsers, onDisconnect }) {
  const [activeTool, setActiveTool] = useState('pan')
  const [showAddToken, setShowAddToken] = useState(false)
  const [activeWidgets, setActiveWidgets] = useState([])

  /* Game-like window shell: one stack, one Esc handler (see windowStack.js).
     I = inventory · L = loot · P = party · Esc = close the top overlay. */
  const win = useWindowStack()
  const [lootPileId, setLootPileId] = useState(null)
  const [focusActorId, setFocusActorId] = useState(null)
  const [placement, setPlacement] = useState(null)
  const placementRef = useRef(null)
  useEffect(() => { placementRef.current = placement }, [placement])
  useVttHotkeys({ dispatch: win.dispatch, hasTop: !!win.top, enabled: !placement })

  // Begin drop-to-ground: close overlays, then the next map click places the pile.
  const startPlacement = useCallback((item) => {
    setPlacement({ itemId: item.id, name: item.name })
    win.dispatch({ type: 'closeAll' })
  }, [win])

  // Cancel placement on Escape.
  useEffect(() => {
    if (!placement) return
    const onKey = (e) => { if (e.key === 'Escape') setPlacement(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [placement])

  /* Clicking a loot-pile token opens the loot panel; while placing, the next
     empty-map click drops the pending item as a pile there. */
  useEffect(() => {
    const controller = canvas?.controller
    if (!controller) return
    const prevToken = controller.onTokenClicked
    const prevScene = controller.onSceneClicked
    controller.onTokenClicked = (tokenData) => {
      const actor = controller.actorMap?.get(tokenData?.actorId)
      const p = placementRef.current
      if (p && actor?.actorType === 'loot-pile') {
        actions?.transferItem({ itemId: p.itemId, toActorId: actor.id }); setPlacement(null); return
      }
      if (actor?.actorType === 'loot-pile') { setLootPileId(actor.id); win.open('loot') }
      else if (actor?.actorType === 'scene-portal') {
        /* Portals move only the user who stepped through — local view.
           (Previously this yanked every connected client to the scene.) */
        const sceneId = actor.attributes?.sceneId
        const sm = canvas?.sceneManager
        if (sceneId && sm?.scenes.some(s => s.id === sceneId)) {
          actions?.viewScene(sceneId)
        }
      }
      else prevToken?.(tokenData)
    }
    controller.onSceneClicked = (x, y) => {
      const p = placementRef.current
      if (p) {
        actions?.createLootPile({ x: x - 35, y: y - 35, fromItemId: p.itemId, name: p.name })
        setPlacement(null); return
      }
      prevScene?.(x, y)
    }
    return () => {
      if (canvas?.controller) {
        canvas.controller.onTokenClicked = prevToken
        canvas.controller.onSceneClicked = prevScene
      }
    }
  }, [canvas, actions, win, eventBus])

  /* Sync active tool to canvas controller once canvas is available */
  useEffect(() => {
    if (canvas?.controller) {
      canvas.setTool(activeTool)
    }
  }, [canvas, activeTool])

  const handleToolSelect = useCallback((tool) => {
    setActiveTool(prev => prev === tool && tool === 'token' ? 'pan' : tool)
  }, [])

  const toggleWidget = useCallback((widgetId) => {
    setActiveWidgets(prev => prev.includes(widgetId)
      ? prev.filter(id => id !== widgetId)
      : [...prev, widgetId])
  }, [])

  const WIDGET_MAP = {
    'tokens-panel': 'tokens',
    'scenes': 'scenes',
    'actors-panel': 'actors',
    'bg': 'bg',
  }

  const handleTopBarAction = useCallback((id) => {
    if (id in WIDGET_MAP) {
      toggleWidget(WIDGET_MAP[id])
      return
    }
    switch (id) {
      case 'inventory': win.open('inventory'); break
      case 'loot': win.open('loot'); break
      case 'party': win.open('party'); break
      case 'add-token': setShowAddToken(true); break
      case 'disconnect': onDisconnect?.(); break
      case 'home': window.location.href = '/'; break
      default: break
    }
  }, [toggleWidget, win, onDisconnect])

  const handleOpenScreen = useCallback((id) => {
    win.open(id)
  }, [win])

  return (
    <>
      <VttTopBar
        isDm={isDm}
        onAction={handleTopBarAction}
        onToolSelect={handleToolSelect}
        activeTool={activeTool}
        activeWidgets={activeWidgets}
        onWidgetsChange={setActiveWidgets}
      />

      <VttHud
        canvas={canvas}
        eventBus={eventBus}
        scene={scene}
        isDm={isDm}
        win={win}
        onOpenScreen={handleOpenScreen}
      />

      <div className="vtt-panels-container">
        {activeWidgets.includes('tokens') && (
          <TokenPanel canvas={canvas} eventBus={eventBus} scene={scene} isDm={isDm} session={session} />
        )}
        {activeWidgets.includes('scenes') && (
          <VttScenePanel canvas={canvas} actions={actions} eventBus={eventBus} connectedUsers={connectedUsers} isDm={isDm} />
        )}
        {activeWidgets.includes('actors') && (
          <ActorPanel canvas={canvas} eventBus={eventBus} scene={scene} isDm={isDm} session={session} connectedUsers={connectedUsers} />
        )}
        {activeWidgets.includes('bg') && (
          <BackgroundPanel canvas={canvas} eventBus={eventBus} scene={scene} />
        )}
      </div>

      {/* Tactical layer: always-on overlays, not widget-toggled. */}
      <CombatTracker canvas={canvas} actions={actions} eventBus={eventBus} isDm={isDm} />
      <UnitPanel canvas={canvas} actions={actions} eventBus={eventBus} session={session} isDm={isDm} />

      {showAddToken && (
        <AddTokenModal canvas={canvas} eventBus={eventBus} onClose={() => setShowAddToken(false)} userId={session?.userId} />
      )}

      {win.stack.map(id => {
        if (id === 'inventory') return (
          <InventoryScreen key="inventory" controller={canvas?.controller} actions={actions} eventBus={eventBus}
            session={session} initialActorId={focusActorId} onDropToGround={startPlacement}
            onClose={() => win.close('inventory')} />
        )
        if (id === 'loot') return (
          <LootPanel key="loot" controller={canvas?.controller} actions={actions} eventBus={eventBus}
            session={session} initialPileId={lootPileId} onClose={() => win.close('loot')} />
        )
        if (id === 'party') return (
          <PartyPanel key="party" controller={canvas?.controller} eventBus={eventBus} session={session}
            onSelect={(actorId) => { setFocusActorId(actorId); win.open('inventory') }}
            onClose={() => win.close('party')} />
        )
        return null
      })}
      {placement && (
        <div className="vtt-place-banner">
          <span>Click the map to drop <b>{placement.name}</b>, or a loot pile to add it</span>
          <button className="inv-btn" onClick={() => setPlacement(null)}>Cancel (Esc)</button>
        </div>
      )}
    </>
  )
}
