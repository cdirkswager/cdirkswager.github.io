import { useState, useEffect, useCallback } from 'react'
import { Scene } from '../../vtt/canvas/Scene.js'

export default function VttScenePanel({ canvas, eventBus, connectedUsers }) {
  const sceneManager = canvas?.sceneManager
  const [scenes, setScenes] = useState(sceneManager ? [...sceneManager.scenes] : [])
  const [activeId, setActiveId] = useState(sceneManager?.activeScene?.id ?? null)
  const [userScenes, setUserScenes] = useState(new Map(sceneManager?.userScenes ?? []))

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

  const handleSwitch = useCallback((sceneId) => {
    if (!sceneManager || !eventBus) return
    sceneManager.switchScene(sceneId)
    eventBus.emitRecord('scene', 'switched', { sceneId })
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

  const userLookup = new Map((connectedUsers ?? []).map(u => [u.userId, u.username ?? u.userId]))

  return (
    <div className="vtt-panel vtt-scene-panel">
      <h4>Scenes ({scenes.length})</h4>
      <button onClick={handleCreate} className="btn btn-sm vtt-action-btn">+ Scene</button>
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
              {s.id !== activeId && (
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
      {activeId && (
        <button onClick={handleMoveAll} className="btn btn-sm vtt-action-btn" style={{ marginTop: 8, width: '100%' }}>
          Move all users to current scene
        </button>
      )}
    </div>
  )
}
