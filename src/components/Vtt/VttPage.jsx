import { Component, useState, useRef, useCallback, useEffect } from 'react'
import VttCanvasMount from './VttCanvasMount'
import VttCockpit from './VttCockpit'
import { lookupServer, registerServer, getVttGameToken, VttConnector } from '../../data/vtt.js'
import { EventBus } from '../../vtt/canvas/EventBus.js'
import { currentUser } from '../../data/auth.js'
import { createSyncBridge } from './VttSyncBridge.js'
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

const FALLBACK_SERVER = 'localhost:3001'

export default function VttPage() {
  const [joinCode, setJoinCode] = useState('')
  const [serverUrl, setServerUrl] = useState('')
  const [connectionState, setConnectionState] = useState('idle')
  const [connectionMessage, setConnectionMessage] = useState('')
  const [isDm, setIsDm] = useState(false)
  const [connectedUsers, setConnectedUsers] = useState([])
  const [canvas, setCanvas] = useState(null)
  const [canvasKey, setCanvasKey] = useState(0)

  const eventBusRef = useRef(null)
  const connectorRef = useRef(null)
  const connectionStateRef = useRef('idle')
  const destroyBridgeRef = useRef(null)

  const session = currentUser()
  const dmCheck = session?.role === 'dm'

  useEffect(() => {
    setIsDm(dmCheck)
  }, [dmCheck])

  useEffect(() => {
    return () => {
      destroyBridgeRef.current?.()
      destroyBridgeRef.current = null
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

    let resolvedUrl = serverUrl || FALLBACK_SERVER

    if (joinCode.trim()) {
      try {
        const lookupResult = await lookupServer(joinCode)
        if (lookupResult) {
          resolvedUrl = lookupResult
        } else {
          setConnectionState('error')
          setConnectionMessage('Join code not found or expired')
          return
        }
      } catch (e) {
        setConnectionState('error')
        setConnectionMessage(e.message || 'Failed to look up server')
        return
      }
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
    setConnectionState('connecting')
    setConnectionMessage('Connecting...')

    const connected = await connector.connect()
  }, [joinCode, serverUrl])

  const handleDisconnect = useCallback(() => {
    destroyBridgeRef.current?.()
    destroyBridgeRef.current = null
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

  const handleRegisterServer = useCallback(async () => {
    if (!serverUrl.trim()) return

    try {
      const result = await registerServer(serverUrl)
      if (result && result.code) {
        setConnectionMessage(`Server registered! Share this code: ${result.code}`)
        setJoinCode(result.code)
      } else {
        setConnectionMessage('Failed to register server')
      }
    } catch (e) {
      setConnectionMessage(e.message || 'Registration failed')
    }
  }, [serverUrl])

  const handleCanvasReady = useCallback((c) => {
    setCanvas(c)
    /* Set permission context on canvas controller */
    if (c.controller) {
      c.controller.userId = session?.userId ?? null
      c.controller.isDm = session?.role === 'dm'
      /* Non-DM players automatically see through all their owned tokens */
      c.controller.syncViewpointToOwnedTokens()
    }
    /* Wire up sync bridge — connects canvas ↔ EventBus ↔ spine */
    if (eventBusRef.current) {
      destroyBridgeRef.current?.()
      destroyBridgeRef.current = createSyncBridge(c, eventBusRef.current)
    }
  }, [session])

  const handleServerPresence = useCallback(() => {
    /* Poll server for presence info */
    fetch('/api/presence')
      .then(r => r.json())
      .then(data => {
        if (data?.users) setConnectedUsers(data.users)
      })
      .catch(() => {})
  }, [])

  /* Poll presence while connected */
  useEffect(() => {
    if (connectionState !== 'connected') return
    const interval = setInterval(handleServerPresence, 5000)
    handleServerPresence()
    return () => clearInterval(interval)
  }, [connectionState, handleServerPresence])

  const handleCanvasReset = useCallback(() => {
    destroyBridgeRef.current?.()
    destroyBridgeRef.current = null
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
              ? 'Host or join a game session. The local server must be running.'
              : 'Enter a join code or server URL to connect to a game session.'}
          </p>

          <div className="vtt-connect-form">
            <div className="vtt-input-group">
              <label htmlFor="join-code">Join Code</label>
              <input
                id="join-code"
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Enter 6-character code"
                maxLength={6}
                className="vtt-input"
              />
            </div>

            <div className="vtt-input-group">
              <label htmlFor="server-url">Server URL (optional)</label>
              <input
                id="server-url"
                type="text"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder={`e.g. ${FALLBACK_SERVER}`}
                className="vtt-input"
              />
            </div>

            {isDm && (
              <button onClick={handleRegisterServer} className="btn btn-sm vtt-register-btn">
                Register Server & Get Code
              </button>
            )}

            <button onClick={handleConnect} className="btn vtt-connect-btn" disabled={connectionState === 'connecting'}>
              {connectionState === 'connecting' ? 'Connecting...' : 'Connect'}
            </button>
          </div>

          {connectionMessage && (
            <p className={`vtt-status ${connectionState === 'error' ? 'vtt-status-error' : ''}`}>{connectionMessage}</p>
          )}

          <div className="vtt-help">
            <h3>How to play:</h3>
            <ol>
              <li>The DM runs the local server (see README for instructions)</li>
              <li>DM clicks "Register Server" and shares the 6-character code</li>
              <li>Players enter the code and click "Connect"</li>
              <li>Everyone sees each other's tokens move in real time</li>
            </ol>
          </div>
        </div>
      ) : (
        <div className="vtt-canvas-area">
          <VttCockpit
            canvas={canvas}
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
