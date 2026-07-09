import { Component, useState, useRef, useCallback, useEffect } from 'react'
import VttCanvasMount from './VttCanvasMount'
import VttCockpit from './VttCockpit'
import { getServerUrl, pingServer, getVttGameToken, VttConnector } from '../../data/vtt.js'
import { EventBus } from '../../vtt/canvas/EventBus.js'
import { currentUser } from '../../data/auth.js'
import { createSyncBridge } from './VttSyncBridge.js'
import { createGameActions } from '../../vtt/GameActions.js'
import './VttPage.css'

class VttErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[VttErrorBoundary] Caught:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="vtt-error-boundary">
          <p>Canvas encountered an error.</p>
          <button onClick={() => { this.setState({ error: null }); this.props.onReset?.() }} className="btn btn-sm">
            Reload Canvas
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export default function VttPage() {
  const [serverUrl, setServerUrl] = useState('')
  const [connectionState, setConnectionState] = useState('idle')
  const [connectionMessage, setConnectionMessage] = useState('')
  const [isDm, setIsDm] = useState(false)
  const [connectedUsers, setConnectedUsers] = useState([])
  const [canvas, setCanvas] = useState(null)
  const [actions, setActions] = useState(null)
  const [canvasKey, setCanvasKey] = useState(0)

  const eventBusRef = useRef(null)
  const connectorRef = useRef(null)
  const connectionStateRef = useRef('idle')
  const destroyBridgeRef = useRef(null)
  const actionsRef = useRef(null)

  const session = currentUser()
  const dmCheck = session?.role === 'dm'

  useEffect(() => {
    setIsDm(dmCheck)
  }, [dmCheck])

  useEffect(() => {
    return () => {
      destroyBridgeRef.current?.()
      destroyBridgeRef.current = null
      actionsRef.current?.destroy()
      actionsRef.current = null
      if (connectorRef.current) {
        connectorRef.current.disconnect()
      }
      if (eventBusRef.current) {
        eventBusRef.current.destroy()
        eventBusRef.current = null
      }
    }
  }, [])

  const handleConnect = useCallback(async () => {
    if (connectorRef.current) {
      connectorRef.current.disconnect()
      connectorRef.current = null
    }

    /* Single shared server: use the configured URL, or an override typed
       into the optional field. Detect that it's actually running before
       attempting the WebSocket + auth handshake, so "server isn't up" is
       a clear message instead of a generic connection timeout. */
    const resolvedUrl = serverUrl.trim() || getServerUrl()

    setConnectionState('connecting')
    setConnectionMessage('Looking for the game server…')

    const alive = await pingServer(resolvedUrl)
    if (!alive) {
      setConnectionState('error')
      setConnectionMessage(
        isDm
          ? 'Server not detected. Start the local server (see README), then Connect.'
          : 'The game server isn\u2019t running yet. Ask the DM to start it, then try again.'
      )
      return
    }

    if (!eventBusRef.current) {
      eventBusRef.current = new EventBus()
    }

    const connector = new VttConnector({
      eventBus: eventBusRef.current,
      getToken: getVttGameToken,
      serverUrl: resolvedUrl,
    })

    connector.setOnStateChange(({ state, message }) => {
      connectionStateRef.current = state
      setConnectionState(state)
      if (message) setConnectionMessage(message)
    })

    connectorRef.current = connector
    setConnectionMessage('Connecting…')

    await connector.connect()
  }, [serverUrl, isDm])

  const handleDisconnect = useCallback(() => {
    destroyBridgeRef.current?.()
    destroyBridgeRef.current = null
    actionsRef.current?.destroy()
    actionsRef.current = null
    setActions(null)
    if (connectorRef.current) {
      connectorRef.current.disconnect()
      connectorRef.current = null
    }
    setCanvas(null)
    connectionStateRef.current = 'disconnected'
    setConnectionState('disconnected')
    setConnectionMessage('Disconnected')
    setConnectedUsers([])
  }, [])

  const handleCanvasReady = useCallback((c) => {
    setCanvas(c)
    /* Set permission context on canvas controller */
    if (c.controller) {
      c.controller.userId = session?.userId ?? null
      c.controller.isDm = session?.role === 'dm'
      /* Shared wall-based dynamic lighting: all clients (DM + players)
         see the union of every vision-enabled token's vision.  Per-player
         vision restriction is deferred. */
      c.controller.syncViewpointToAllVisionTokens()
    }
    /* Wire up sync bridge — connects canvas ↔ EventBus ↔ spine */
    if (eventBusRef.current) {
      destroyBridgeRef.current?.()
      destroyBridgeRef.current = createSyncBridge(c, eventBusRef.current)
      actionsRef.current?.destroy()
      actionsRef.current = createGameActions({ canvas: c, eventBus: eventBusRef.current })
      setActions(actionsRef.current)
    }
  }, [session])

  /* Presence is pushed by the game server over the WebSocket on every
     connect/disconnect and surfaced on the event bus by VttSyncClient.
     (The old implementation polled /api/presence on the *site* origin,
     which doesn't exist there — presence lives on the DM's local server.) */
  useEffect(() => {
    if (connectionState !== 'connected' || !eventBusRef.current) return
    const unsub = eventBusRef.current.on('presence', ({ users }) => {
      setConnectedUsers(users ?? [])
    })
    return unsub
  }, [connectionState])

  const handleCanvasReset = useCallback(() => {
    destroyBridgeRef.current?.()
    destroyBridgeRef.current = null
    actionsRef.current?.destroy()
    actionsRef.current = null
    setActions(null)
    setCanvas(null)
    setCanvasKey(k => k + 1)
  }, [])

  const isConnected = connectionState === 'connected'

  return (
    <div className="vtt-page">
      {!isConnected ? (
        <div className="vtt-connect-panel">
          <h2>VTT Canvas</h2>
          <p className="vtt-subtitle">
            {isDm
              ? 'Start the local server, then connect to the shared canvas.'
              : 'Connect to the shared canvas once the DM has started the server.'}
          </p>

          <div className="vtt-connect-form">
            <div className="vtt-input-group">
              <label htmlFor="server-url">Server address (optional)</label>
              <input
                id="server-url"
                type="text"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder={getServerUrl().replace(/^wss?:\/\//, '')}
                className="vtt-input"
              />
              <span className="vtt-input-hint">Leave blank to use the default server.</span>
            </div>

            <button onClick={handleConnect} className="btn vtt-connect-btn" disabled={connectionState === 'connecting'}>
              {connectionState === 'connecting' ? 'Connecting…' : 'Connect'}
            </button>
          </div>

          {connectionMessage && (
            <p className={`vtt-status ${connectionState === 'error' ? 'vtt-status-error' : ''}`}>{connectionMessage}</p>
          )}

          <div className="vtt-help">
            <h3>How to play:</h3>
            <ol>
              <li>The DM runs the local server (see README for instructions)</li>
              <li>Everyone opens this page and clicks &ldquo;Connect&rdquo;</li>
              <li>You all share one canvas and see each other&rsquo;s tokens move in real time</li>
            </ol>
          </div>
        </div>
      ) : (
        <div className="vtt-canvas-area">
          <VttCockpit
            canvas={canvas}
            actions={actions}
            eventBus={eventBusRef.current}
            scene={canvas?.scene}
            isDm={isDm}
            session={session}
            connectedUsers={connectedUsers}
            onDisconnect={handleDisconnect}
          />
          <VttErrorBoundary key={canvasKey} onReset={handleCanvasReset}>
            <VttCanvasMount
              eventBus={eventBusRef.current}
              onReady={handleCanvasReady}
            />
          </VttErrorBoundary>
        </div>
      )}
    </div>
  )
}
