import { useState, useEffect, useCallback } from 'react'
import { Scene } from '../../vtt/canvas/Scene.js'

export default function VttScenePanel({ canvas, eventBus, connectedUsers, isDm }) {
  const sceneManager = canvas?.sceneManager
  const [scenes, setScenes] = useState(sceneManager ? [...sceneManager.scenes] : [])
  const [activeId, setActiveId] = useState(sceneManager?.activeScene?.id ?? null)
  const [userScenes, setUserScenes] = useState(new Map(sceneManager?.userScenes ?? []))

  /* Lighting & Vision state */
  const [lighting, setLighting] = useState(canvas?.scene?.lightingEnabled ?? false)
  const [ambient, setAmbient] = useState(canvas?.scene?.ambientLight ?? 0)
  const [gridUnit, setGridUnit] = useState(canvas?.scene?.gridUnit ?? 5)
  const [gridUnitLabel, setGridUnitLabel] = useState(canvas?.scene?.gridUnitLabel ?? 'ft')
  const [viewAll, setViewAll] = useState(canvas?.controller?.viewAll ?? false)
  const [viewpointId, setViewpointId] = useState(canvas?.controller?._viewpointTokenIds?.[0] ?? '')
  const [tokens, setTokens] = useState(canvas?.scene ? [...canvas.scene.tokens] : [])
  const [sceneName, setSceneName] = useState(canvas?.scene?.name ?? '')

  useEffect(() => {
    if (!sceneManager) return
    function refresh() {
      setScenes([...sceneManager.scenes])
      setActiveId(sceneManager.activeScene?.id ?? null)
      setUserScenes(new Map(sceneManager.userScenes))
    }
    refresh()
    return eventBus?.on('scenes-changed', refresh)
  }, [sceneManager, eventBus])

  /* Auto-register connected users into userScenes */
  useEffect(() => {
    if (!sceneManager || !connectedUsers) return
    let changed = false
    for (const u of connectedUsers) {
      if (!sceneManager.userScenes.has(u.userId)) {
        sceneManager.setUserScene(u.userId, sceneManager.activeScene?.id)
        changed = true
      }
    }
    if (changed) {
      setUserScenes(new Map(sceneManager.userScenes))
    }
  }, [sceneManager, connectedUsers])

  /* Sync token list when tokens change */
  useEffect(() => {
    if (!eventBus || !canvas?.scene) return
    const sync = () => setTokens([...canvas.scene.tokens])
    sync()
    const unsub1 = eventBus.on('token:created', sync)
    const unsub2 = eventBus.on('token:updated', sync)
    const unsub3 = eventBus.on('token:deleted', sync)
    return () => { unsub1(); unsub2(); unsub3() }
  }, [eventBus, canvas])

  /* Sync lighting state from scene record changes */
  useEffect(() => {
    if (!eventBus || !canvas?.scene) return
    const refresh = () => {
      setLighting(canvas.scene.lightingEnabled)
      setAmbient(canvas.scene.ambientLight ?? 0)
      setSceneName(canvas.scene.name)
      setGridUnit(canvas.scene.gridUnit ?? 5)
      setGridUnitLabel(canvas.scene.gridUnitLabel ?? 'ft')
    }
    const unsub1 = eventBus.on('scene:updated', refresh)
    const unsub2 = eventBus.on('scene:switched', () => {
      refresh()
      setTokens([...canvas.scene.tokens])
      setViewAll(canvas.controller?.viewAll ?? false)
      setViewpointId(canvas.controller?._viewpointTokenIds?.[0] ?? '')
    })
    return () => { unsub1(); unsub2() }
  }, [eventBus, canvas])

  const maybeEmitSceneUpdate = useCallback((changes) => {
    if (!canvas?.scene || !eventBus) return
    Object.assign(canvas.scene, changes)
    eventBus.emitRecord('scene', 'updated', { id: canvas.scene.id, ...changes })
  }, [canvas, eventBus])

  const handleSwitch = useCallback((sceneId) => {
    if (!sceneManager || !eventBus) return
    sceneManager.switchScene(sceneId)
    eventBus.emitEphemeral('scene:switched', { sceneId })
  }, [sceneManager, eventBus])

  const handleCreate = useCallback(() => {
    if (!sceneManager || !eventBus) return
    const s = new Scene({ name: `Scene ${scenes.length + 1}` })
    sceneManager.add(s)
    eventBus.emitRecord('scene', 'created', s.toJSON())
  }, [sceneManager, eventBus, scenes])

  const handleDelete = useCallback((sceneId) => {
    if (!sceneManager || !eventBus || sceneId === activeId) return
    sceneManager.remove(sceneId)
    eventBus.emitRecord('scene', 'deleted', { id: sceneId })
  }, [sceneManager, eventBus, activeId])

  const handleMoveAll = useCallback(() => {
    if (!sceneManager || !activeId) return
    sceneManager.moveAllUsersToScene(activeId)
  }, [sceneManager, activeId])

  /* Lighting & Vision handlers */
  const handleToggleLighting = useCallback(() => {
    const next = !lighting
    setLighting(next)
    canvas.setLightingEnabled(next)
    canvas.scene.lightingEnabled = next
    maybeEmitSceneUpdate({ lightingEnabled: next })
    if (next) canvas.refreshLighting()
  }, [canvas, lighting, maybeEmitSceneUpdate])

  const handleSetAmbient = useCallback((e) => {
    const val = Number(e.target.value)
    setAmbient(val)
    canvas.scene.ambientLight = val
    maybeEmitSceneUpdate({ ambientLight: val })
    canvas.refreshLighting()
  }, [canvas, maybeEmitSceneUpdate])

  const handleGridUnitChange = useCallback((e) => {
    const val = Number(e.target.value)
    setGridUnit(val)
    if (canvas?.scene) {
      canvas.scene.gridUnit = val
      canvas.renderer.rulerLayer.setGrid(canvas.scene.gridSize, canvas.scene.gridType, val, canvas.scene.gridUnitLabel)
    }
  }, [canvas])

  const handleGridUnitLabelChange = useCallback((e) => {
    const val = e.target.value
    setGridUnitLabel(val)
    if (canvas?.scene) {
      canvas.scene.gridUnitLabel = val
      canvas.renderer.rulerLayer.setGrid(canvas.scene.gridSize, canvas.scene.gridType, canvas.scene.gridUnit, val)
    }
  }, [canvas])

  const handleToggleViewAll = useCallback(() => {
    const next = !viewAll
    setViewAll(next)
    if (canvas?.controller) {
      canvas.controller.viewAll = next
      canvas.refreshLighting()
    }
  }, [canvas, viewAll])

  const handleViewpointSelect = useCallback((e) => {
    const id = e.target.value
    setViewpointId(id)
    if (!canvas?.controller) return
    if (id) {
      canvas.controller.viewAll = false
      setViewAll(false)
      canvas.setViewpoint(id)
    } else {
      canvas.controller.setViewpoint([])
      canvas.controller.viewAll = true
      setViewAll(true)
      canvas.refreshLighting()
    }
  }, [canvas])

  const handleNameChange = useCallback((e) => {
    const val = e.target.value
    setSceneName(val)
    canvas.scene.name = val
    maybeEmitSceneUpdate({ name: val })
  }, [canvas, maybeEmitSceneUpdate])

  const userLookup = new Map((connectedUsers ?? []).map(u => [u.userId, u.username ?? u.userId]))

  return (
    <div className="vtt-panel vtt-scene-panel">
      <h4>Scenes ({scenes.length})</h4>
      {isDm && <button onClick={handleCreate} className="btn btn-sm vtt-action-btn">+ Scene</button>}
      <div className="vtt-scene-list">
        {scenes.map(s => {
          const sw = Math.round(s.width / s.gridSize)
          const sh = Math.round(s.height / s.gridSize)
          const usersOnScene = []
          for (const [uid, sid] of userScenes) {
            if (sid === s.id) usersOnScene.push(uid)
          }
          return (
            <div
              key={s.id}
              className={`vtt-scene-item ${s.id === activeId ? 'active' : ''}`}
            >
              <div className="vtt-scene-item-main" onClick={() => handleSwitch(s.id)}>
                <span className="vtt-scene-name">{s.name}</span>
                <span className="vtt-scene-size">{sw}×{sh}</span>
              </div>
              {usersOnScene.length > 0 && (
                <div className="vtt-scene-users">
                  {usersOnScene.map(uid => (
                    <span key={uid} className="vtt-scene-user-dot" title={userLookup.get(uid) ?? uid}>
                      {userLookup.get(uid) ?? '?'}
                    </span>
                  ))}
                </div>
              )}
              {isDm && s.id !== activeId && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(s.id) }}
                  className="btn btn-sm vtt-disconnect-btn"
                  title="Delete scene"
                >✕</button>
              )}
            </div>
          )
        })}
      </div>
      {isDm && activeId && (
        <button onClick={handleMoveAll} className="btn btn-sm vtt-action-btn" style={{ marginTop: 8, width: '100%' }}>
          Move all users to current scene
        </button>
      )}

      <hr className="vtt-divider" />

      {canvas?.scene && (
        <div className="vtt-scene-settings">
          <h4>Active Scene Settings</h4>

          {isDm && (
            <label>Name
              <input type="text" value={sceneName} onChange={handleNameChange} className="vtt-input" />
            </label>
          )}

          <label className="vtt-toggle">
            <input type="checkbox" checked={lighting} onChange={handleToggleLighting} />
            Lighting
          </label>

          <label>Ambient Light (0-1)
            <input type="range" min="0" max="1" step="0.05" value={ambient} onChange={handleSetAmbient} className="vtt-range" />
          </label>

          {isDm && (
            <>
              <label className="vtt-toggle">
                <input type="checkbox" checked={viewAll} onChange={handleToggleViewAll} />
                GM View All
              </label>

              <label>View from token
                <select value={viewpointId} onChange={handleViewpointSelect} className="vtt-input">
                  <option value="">— None (view all) —</option>
                  {tokens.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </label>

              <hr className="vtt-divider" />

              <h4>Grid & Ruler</h4>
              <label>Unit per grid cell
                <input type="number" min="0.1" step="1" value={gridUnit} onChange={handleGridUnitChange} className="vtt-input" />
              </label>
              <label>Unit label
                <input type="text" value={gridUnitLabel} onChange={handleGridUnitLabelChange} className="vtt-input" placeholder="e.g. ft, m" />
              </label>
            </>
          )}
        </div>
      )}
    </div>
  )
}
