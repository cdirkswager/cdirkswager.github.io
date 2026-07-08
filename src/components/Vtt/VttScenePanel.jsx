import { useState, useEffect, useCallback, useRef } from 'react'
import { Scene } from '../../vtt/canvas/Scene.js'

export default function VttScenePanel({ canvas, eventBus, connectedUsers, isDm }) {
  const sceneManager = canvas?.sceneManager
  const [scenes, setScenes] = useState(sceneManager ? [...sceneManager.scenes] : [])
  const [activeId, setActiveId] = useState(sceneManager?.activeScene?.id ?? null)
  const [userScenes, setUserScenes] = useState(new Map(sceneManager?.userScenes ?? []))
  const [tokens, setTokens] = useState(canvas?.scene ? [...canvas.scene.tokens] : [])
  const [expandedSceneId, setExpandedSceneId] = useState(null)
  const [editingName, setEditingName] = useState(null)
  const [editNameValue, setEditNameValue] = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState(null)

  /* rAF throttle for expensive refreshLighting calls (e.g., slider drag) */
  const lightingRafRef = useRef(null)
  const scheduleRefreshLighting = useCallback(() => {
    if (lightingRafRef.current) return
    lightingRafRef.current = requestAnimationFrame(() => {
      lightingRafRef.current = null
      if (canvas?.refreshLighting) canvas.refreshLighting()
    })
  }, [canvas])
  useEffect(() => () => { if (lightingRafRef.current) cancelAnimationFrame(lightingRafRef.current) }, [])

  const userLookup = new Map((connectedUsers ?? []).map(u => [u.userId, u.username ?? u.userId]))

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

  useEffect(() => {
    if (!eventBus || !canvas?.scene) return
    const sync = () => setTokens([...canvas.scene.tokens])
    sync()
    const unsub1 = eventBus.on('token:created', sync)
    const unsub2 = eventBus.on('token:updated', sync)
    const unsub3 = eventBus.on('token:deleted', sync)
    return () => { unsub1(); unsub2(); unsub3() }
  }, [eventBus, canvas])

  /* Auto-collapse detail panel when switching scenes */
  useEffect(() => {
    if (!eventBus) return
    return eventBus.on('scene:switched', () => setExpandedSceneId(null))
  }, [eventBus])

  const emitSceneUpdate = useCallback((sceneId, changes) => {
    if (!eventBus) return
    const s = sceneManager?.scenes.find(x => x.id === sceneId)
    if (s) Object.assign(s, changes)
    eventBus.emitRecord('scene', 'updated', { id: sceneId, ...changes })
    setScenes(sceneManager ? [...sceneManager.scenes] : [])
  }, [eventBus, sceneManager])

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
    setDeleteConfirmId(null)
  }, [sceneManager, eventBus, activeId])

  const handleMoveAll = useCallback(() => {
    if (!sceneManager || !activeId) return
    sceneManager.moveAllUsersToScene(activeId)
  }, [sceneManager, activeId])

  /* Eyeball toggle per scene row */
  const handleToggleSceneLighting = useCallback((sceneId) => {
    const s = sceneManager?.scenes.find(x => x.id === sceneId)
    if (!s || !eventBus) return
    const next = !s.lightingEnabled
    s.lightingEnabled = next
    eventBus.emitRecord('scene', 'updated', { id: sceneId, lightingEnabled: next })
    if (canvas?.scene?.id === sceneId) {
      canvas.setLightingEnabled(next)
      if (next) canvas.refreshLighting()
    }
    setScenes([...sceneManager.scenes])
  }, [sceneManager, eventBus, canvas])

  /* Name editing */
  const handleStartEditName = useCallback((sceneId, current) => {
    setEditingName(sceneId)
    setEditNameValue(current)
  }, [])

  const handleSaveName = useCallback(() => {
    if (!editingName || !editNameValue || !eventBus || !sceneManager) return
    const s = sceneManager.scenes.find(x => x.id === editingName)
    if (s) s.name = editNameValue
    eventBus.emitRecord('scene', 'updated', { id: editingName, name: editNameValue })
    if (canvas?.scene?.id === editingName) canvas.scene.name = editNameValue
    setEditingName(null)
    setEditNameValue('')
    setScenes([...sceneManager.scenes])
  }, [editingName, editNameValue, eventBus, sceneManager, canvas])

  const handleCancelEditName = useCallback(() => {
    setEditingName(null)
    setEditNameValue('')
  }, [])

  const handleNameKeyDown = useCallback((e) => {
    if (e.key === 'Enter') handleSaveName()
    else if (e.key === 'Escape') handleCancelEditName()
  }, [handleSaveName, handleCancelEditName])

  /* Detail panel: map size */
  const handleMapSizeChange = useCallback((sceneId, dim, gridVal) => {
    const s = sceneManager?.scenes.find(x => x.id === sceneId)
    if (!s || !eventBus) return
    const px = Math.round(gridVal * s.gridSize)
    if (dim === 'width') s.width = px
    else s.height = px
    eventBus.emitRecord('scene', 'updated', { id: sceneId, width: s.width, height: s.height })
    setScenes([...sceneManager.scenes])
  }, [sceneManager, eventBus])

  /* Detail panel: ambient light (throttled via rAF) */
  const handleSetAmbient = useCallback((sceneId, e) => {
    const val = Number(e.target.value)
    emitSceneUpdate(sceneId, { ambientLight: val })
    if (canvas?.scene?.id === sceneId) {
      canvas.scene.ambientLight = val
      scheduleRefreshLighting()
    }
  }, [emitSceneUpdate, canvas, scheduleRefreshLighting])

  /* Detail panel: view from token */
  const handleViewpointSelect = useCallback((sceneId, e) => {
    const id = e.target.value
    if (!canvas?.controller) return
    if (id) {
      canvas.controller.viewAll = false
      canvas.setViewpoint(id)
    } else {
      canvas.controller.setViewpoint([])
      canvas.controller.viewAll = true
      canvas.refreshLighting()
    }
    if (canvas?.scene?.id !== sceneId) return
  }, [canvas])

  /* Detail panel: grid unit */
  const handleGridUnitChange = useCallback((sceneId, e) => {
    const val = Number(e.target.value)
    emitSceneUpdate(sceneId, { gridUnit: val })
    if (canvas?.scene?.id === sceneId && canvas.renderer?.rulerLayer) {
      const s = sceneManager?.scenes.find(x => x.id === sceneId)
      if (s) canvas.renderer.rulerLayer.setGrid(s.gridSize, s.gridType, val, s.gridUnitLabel)
    }
  }, [emitSceneUpdate, canvas, sceneManager])

  const handleGridUnitLabelChange = useCallback((sceneId, e) => {
    const val = e.target.value
    emitSceneUpdate(sceneId, { gridUnitLabel: val })
    if (canvas?.scene?.id === sceneId && canvas.renderer?.rulerLayer) {
      const s = sceneManager?.scenes.find(x => x.id === sceneId)
      if (s) canvas.renderer.rulerLayer.setGrid(s.gridSize, s.gridType, s.gridUnit, val)
    }
  }, [emitSceneUpdate, canvas, sceneManager])

  /* Render a detail panel for an expanded scene */
  const renderDetailPanel = (s) => {
    const sw = Math.round(s.width / s.gridSize)
    const sh = Math.round(s.height / s.gridSize)
    return (
      <div className="vtt-scene-detail" key={`detail-${s.id}`}>
        <div className="vtt-scene-detail-row">
          <span className="vtt-scene-detail-label">Map Size</span>
          <input
            type="number" min="1" step="1"
            className="vtt-input vtt-scene-detail-size"
            value={sw}
            onChange={(e) => handleMapSizeChange(s.id, 'width', Number(e.target.value))}
            disabled={!isDm}
          />
          <span className="vtt-scene-detail-x">&times;</span>
          <input
            type="number" min="1" step="1"
            className="vtt-input vtt-scene-detail-size"
            value={sh}
            onChange={(e) => handleMapSizeChange(s.id, 'height', Number(e.target.value))}
            disabled={!isDm}
          />
          <span className="vtt-scene-detail-unit">cells</span>
        </div>

        {isDm && (
          <>
            <div className="vtt-scene-detail-row">
              <span className="vtt-scene-detail-label">Ambient Light</span>
              <input
                type="range" min="0" max="1" step="0.05"
                className="vtt-range vtt-scene-detail-range"
                value={s.ambientLight ?? 0}
                onChange={(e) => handleSetAmbient(s.id, e)}
              />
              <span className="vtt-scene-detail-value">{Math.round((s.ambientLight ?? 0) * 100)}%</span>
            </div>

            <div className="vtt-scene-detail-row">
              <span className="vtt-scene-detail-label">View from</span>
              <select
                className="vtt-input"
                value={canvas?.controller?._viewpointTokenIds?.[0] ?? ''}
                onChange={(e) => handleViewpointSelect(s.id, e)}
                disabled={canvas?.scene?.id !== s.id}
              >
                <option value="">&mdash; None (view all) &mdash;</option>
                {tokens.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            <hr className="vtt-divider" />

            <h5 className="vtt-scene-detail-section">Grid</h5>
            <div className="vtt-scene-detail-row">
              <span className="vtt-scene-detail-label">Per cell</span>
              <input
                type="number" min="0.1" step="1"
                className="vtt-input vtt-scene-detail-sm"
                value={s.gridUnit ?? 5}
                onChange={(e) => handleGridUnitChange(s.id, e)}
              />
              <input
                type="text"
                className="vtt-input vtt-scene-detail-sm"
                value={s.gridUnitLabel ?? 'ft'}
                onChange={(e) => handleGridUnitLabelChange(s.id, e)}
                placeholder="ft"
              />
            </div>
          </>
        )}

        {isDm && s.id !== activeId && (
          <>
            <hr className="vtt-divider" />
            {deleteConfirmId === s.id ? (
              <div className="vtt-scene-detail-confirm">
                <span className="vtt-scene-detail-confirm-text">Delete &ldquo;{s.name}&rdquo;?</span>
                <button
                  className="btn btn-sm vtt-danger-btn"
                  onClick={() => handleDelete(s.id)}
                >Yes, delete</button>
                <button
                  className="btn btn-sm"
                  onClick={() => setDeleteConfirmId(null)}
                >Cancel</button>
              </div>
            ) : (
              <button
                className="btn btn-sm vtt-danger-btn vtt-scene-detail-delete"
                onClick={() => setDeleteConfirmId(s.id)}
              >Delete Scene</button>
            )}
          </>
        )}
      </div>
    )
  }

  return (
    <div className="vtt-panel vtt-scene-panel">
      <div className="vtt-scene-panel-header">
        <h4>Scenes ({scenes.length})</h4>
        {isDm && <button onClick={handleCreate} className="btn btn-sm vtt-action-btn">+ Scene</button>}
      </div>
      <div className="vtt-scene-list">
        {scenes.map(s => {
          const usersOnScene = []
          for (const [uid, sid] of userScenes) {
            if (sid === s.id) usersOnScene.push(uid)
          }
          const isExpanded = expandedSceneId === s.id
          return (
            <div key={s.id} className={`vtt-scene-item ${s.id === activeId ? 'active' : ''}`}>
              <div className="vtt-scene-item-main" onClick={() => handleSwitch(s.id)}>
                {editingName === s.id ? (
                  <input
                    type="text"
                    className="vtt-input vtt-scene-name-input"
                    value={editNameValue}
                    onChange={(e) => setEditNameValue(e.target.value)}
                    onBlur={handleSaveName}
                    onKeyDown={handleNameKeyDown}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span
                    className="vtt-scene-name"
                    onDoubleClick={(e) => { e.stopPropagation(); handleStartEditName(s.id, s.name) }}
                    title="Double-click to rename"
                  >{s.name}</span>
                )}
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
              <button
                className={`btn btn-sm vtt-icon-btn ${s.lightingEnabled ? 'vtt-lighting-on' : ''}`}
                onClick={(e) => { e.stopPropagation(); handleToggleSceneLighting(s.id) }}
                title={s.lightingEnabled ? 'Disable lighting' : 'Enable lighting'}
              >{s.lightingEnabled ? '\u25C9' : '\u25CE'}</button>
              <button
                className={`btn btn-sm vtt-icon-btn ${isExpanded ? 'vtt-expand-active' : ''}`}
                onClick={(e) => { e.stopPropagation(); setExpandedSceneId(isExpanded ? null : s.id) }}
                title="Scene settings"
              >{isExpanded ? '\u25BC' : '\u25B6'}</button>
              {isExpanded && renderDetailPanel(s)}
            </div>
          )
        })}
      </div>
      {isDm && activeId && (
        <button onClick={handleMoveAll} className="btn btn-sm vtt-action-btn vtt-move-all-btn">
          Move all users here
        </button>
      )}
    </div>
  )
}
