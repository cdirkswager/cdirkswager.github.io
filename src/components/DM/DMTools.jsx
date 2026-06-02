import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  getPlayers, getMaps, getMapPins, getQuestionnaires,
  deletePlayer, saveMap, deleteMap, deleteMapPin, deleteQuestionnaire,
  exportData, importData, resetData,
  exportFullData, importFullData,
  getAllComments, deleteComment,
} from '../../data/store'
import {
  getAccessRequests, approveRequest, denyRequest,
  getAllUsers, deleteUser, setPlayerIdForUser,
  currentUser, getSession, logout as authLogout, unclaimPlayerId,
} from '../../data/auth'
import Modal from '../common/Modal'
import './DMTools.css'

export default function DMTools() {
  const navigate = useNavigate()
  const [players, setPlayers] = useState([])
  const [maps, setMaps] = useState([])
  const [pins, setPins] = useState([])
  const [questionnaires, setQuestionnaires] = useState([])
  const [requests, setRequests] = useState([])
  const [users, setUsers] = useState([])
  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')
  const [importStatus, setImportStatus] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)
  const [showFullImport, setShowFullImport] = useState(false)
  const [fullImportText, setFullImportText] = useState('')
  const [fullImportStatus, setFullImportStatus] = useState('')
  const [showUsers, setShowUsers] = useState(false)
  const [selectedReq, setSelectedReq] = useState(null)
  const [editingReqPlayer, setEditingReqPlayer] = useState('')
  const [confirmUserDelete, setConfirmUserDelete] = useState(null)
  const [showMapModal, setShowMapModal] = useState(false)
  const [editingMap, setEditingMap] = useState(null)
  const [mapForm, setMapForm] = useState({ name: '', imageUrl: '' })
  const [confirmMapDelete, setConfirmMapDelete] = useState(null)

  const refresh = () => {
    setPlayers(getPlayers())
    setMaps(getMaps())
    setPins(getMapPins())
    setQuestionnaires(getQuestionnaires())
    setRequests(getAccessRequests())
    setUsers(getAllUsers())
  }

  useEffect(() => {
    const session = getSession()
    if (!session || session.role !== 'dm') {
      navigate('/login', { replace: true })
      return
    }
    refresh()
  }, [navigate])

  const handleExport = () => {
    const data = exportData()
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `hunt-campaign-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = () => {
    if (importData(importText)) {
      setImportStatus('✅ Data imported successfully!')
      refresh()
      setTimeout(() => { setShowImport(false); setImportStatus('') }, 1500)
    } else {
      setImportStatus('❌ Invalid data format. Please check the JSON.')
    }
  }

  const handleFullExport = () => {
    const data = exportFullData()
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `hunt-full-backup-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleFullImport = () => {
    const result = importFullData(fullImportText)
    if (result.ok) {
      localStorage.setItem('hunt-users', JSON.stringify(result.users))
      localStorage.setItem('hunt-access-requests', JSON.stringify(result.requests))
      setFullImportStatus('✅ Full data imported successfully!')
      refresh()
      setTimeout(() => { setShowFullImport(false); setFullImportStatus('') }, 1500)
    } else {
      setFullImportStatus('❌ Invalid full backup format.')
    }
  }

  const handleReset = () => {
    resetData()
    setConfirmReset(false)
    refresh()
  }

  const handleDeletePlayer = (id) => {
    if (confirm('Delete this player? This cannot be undone.')) {
      unclaimPlayerId(id)
      deletePlayer(id)
      refresh()
    }
  }

  const handleDeletePin = (id) => {
    if (confirm('Delete this pin?')) {
      deleteMapPin(id)
      refresh()
    }
  }

  const handleDeleteQuestionnaire = (id) => {
    if (confirm('Delete this questionnaire?')) {
      deleteQuestionnaire(id)
      refresh()
    }
  }

  const handleAddMap = () => {
    setEditingMap(null)
    setMapForm({ name: '', imageUrl: '' })
    setShowMapModal(true)
  }

  const handleEditMap = (map) => {
    setEditingMap(map)
    setMapForm({ name: map.name, imageUrl: map.imageUrl || '' })
    setShowMapModal(true)
  }

  const handleSaveMap = () => {
    if (!mapForm.name.trim()) return
    saveMap(editingMap ? { ...editingMap, name: mapForm.name.trim(), imageUrl: mapForm.imageUrl.trim() } : { name: mapForm.name.trim(), imageUrl: mapForm.imageUrl.trim() })
    setShowMapModal(false)
    setEditingMap(null)
    refresh()
  }

  const handleDeleteMap = (id) => {
    deleteMap(id)
    setConfirmMapDelete(null)
    refresh()
  }

  const handleApprove = (req) => {
    setSelectedReq(req)
    setEditingReqPlayer(req.playerId || '')
  }

  const confirmApprove = () => {
    if (!selectedReq || !editingReqPlayer) return
    approveRequest(selectedReq.id, editingReqPlayer, selectedReq.username)
    setPlayerIdForUser(selectedReq.username, editingReqPlayer)
    setSelectedReq(null)
    refresh()
  }

  const handleDeny = (reqId) => {
    if (confirm('Deny this request?')) {
      denyRequest(reqId)
      refresh()
    }
  }

  const handleDeleteUser = (userId) => {
    const session = currentUser()
    if (session && session.userId === userId) {
      deleteUser(userId)
      authLogout()
      navigate('/')
      return
    }
    setConfirmUserDelete(userId)
  }

  const pendingRequests = requests.filter(r => r.status === 'pending')

  return (
    <div className="page">
      <div className="container">
        <div className="dm-header">
          <div>
            <h1 className="text-gold">⚔️ DM Tools</h1>
            <p className="text-muted">Manage your campaign</p>
          </div>
          <div className="dm-header-actions">
            <button className="btn btn-sm" onClick={handleExport}>📤 Export</button>
            <button className="btn btn-sm" onClick={() => setShowImport(true)}>📥 Import</button>
            <button className="btn btn-sm" onClick={handleFullExport}>💾 Full Backup</button>
            <button className="btn btn-sm" onClick={() => setShowFullImport(true)}>📂 Restore Backup</button>
            <button className="btn btn-sm" onClick={() => setShowUsers(true)}>👥 Users</button>
            <button className="btn btn-sm btn-danger" onClick={() => setConfirmReset(true)}>⚠️ Reset</button>
          </div>
        </div>

        <div className="dm-stats">
          <div className="dm-stat-card card gold-border">
            <span className="dm-stat-number">{players.length}</span>
            <span className="dm-stat-label">Adventurers</span>
          </div>
          <div className="dm-stat-card card gold-border">
            <span className="dm-stat-number">{pins.length}</span>
            <span className="dm-stat-label">Map Pins</span>
          </div>
          <div className="dm-stat-card card gold-border">
            <span className="dm-stat-number">{questionnaires.length}</span>
            <span className="dm-stat-label">Questionnaires</span>
          </div>
          <div className="dm-stat-card card gold-border">
            <span className="dm-stat-number">{users.length}</span>
            <span className="dm-stat-label">Users</span>
          </div>
        </div>

        {pendingRequests.length > 0 && (
          <div className="card gold-border mb-2" style={{ borderColor: '#d4522a' }}>
            <div className="flex-between mb-2">
              <h3 className="widget-title" style={{ color: '#d4522a' }}>
                🔔 Access Requests ({pendingRequests.length})
              </h3>
            </div>
            <div className="dm-list">
              {pendingRequests.map(req => (
                <div key={req.id} className="dm-list-item">
                  <div className="dm-list-info">
                    <span className="dm-list-dot" style={{ background: '#d4522a' }} />
                    <div>
                      <span className="dm-list-name">{req.username}</span>
                      {req.playerId && (
                        <span className="dm-list-detail">
                          wants: {players.find(p => p.id === req.playerId)?.name || 'Unknown'}
                        </span>
                      )}
                      {req.message && (
                        <p className="text-muted" style={{ fontSize: '0.85rem', marginTop: 4 }}>
                          "{req.message}"
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="dm-list-actions">
                    <button className="btn btn-sm btn-primary" onClick={() => handleApprove(req)}>
                      ✅ Approve
                    </button>
                    <button className="btn btn-sm btn-danger" onClick={() => handleDeny(req.id)}>
                      ❌ Deny
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="card gold-border mb-2">
          <div className="flex-between mb-2">
            <h3 className="widget-title">🎭 Players</h3>
            <Link to="/dm/players" className="btn btn-sm btn-primary">➕ Add Player</Link>
          </div>
          {players.length === 0 ? (
            <p className="text-muted">No players yet.</p>
          ) : (
            <div className="dm-list">
              {players.map(p => {
                const owner = users.find(u => u.playerId === p.id)
                return (
                  <div key={p.id} className="dm-list-item">
                    <div className="dm-list-info">
                      <span className="dm-list-name">{p.name}</span>
                      <span className="dm-list-detail">{p.race} {p.class} &middot; Lvl {p.level}</span>
                      {owner ? (
                        <span className="dm-list-detail" style={{ color: 'var(--accent-magic)' }}>
                          🎭 {owner.username}
                        </span>
                      ) : (
                        <span className="dm-list-detail" style={{ color: 'var(--text-muted)' }}>
                          unclaimed
                        </span>
                      )}
                    </div>
                    <div className="dm-list-actions">
                      <Link to={`/player/${p.id}`} className="btn btn-sm">👤 View</Link>
                      <Link to={`/dm/player/${p.id}`} className="btn btn-sm">✏️ Edit</Link>
                      <button className="btn btn-sm btn-danger" onClick={() => handleDeletePlayer(p.id)}>🗑️</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="card gold-border mb-2">
          <div className="flex-between mb-2">
            <h3 className="widget-title">🗺️ Maps</h3>
            <button className="btn btn-sm btn-primary" onClick={handleAddMap}>➕ Add Map</button>
          </div>
          {maps.length === 0 ? (
            <p className="text-muted">No maps yet.</p>
          ) : (
            <div className="dm-list">
              {maps.map(m => {
                const mapPinCount = pins.filter(p => p.mapId === m.id).length
                return (
                  <div key={m.id} className="dm-list-item">
                    <div className="dm-list-info">
                      <span className="dm-list-name">{m.name}</span>
                      <span className="dm-list-detail">{mapPinCount} pin{mapPinCount !== 1 ? 's' : ''}</span>
                      {m.imageUrl && <span className="dm-list-detail" style={{ fontSize: '0.75rem' }}>custom image</span>}
                    </div>
                    <div className="dm-list-actions">
                      <Link to="/map" className="btn btn-sm">🗺️ View</Link>
                      <button className="btn btn-sm" onClick={() => handleEditMap(m)}>✏️</button>
                      <button className="btn btn-sm btn-danger" onClick={() => setConfirmMapDelete(m)}>🗑️</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="card gold-border mb-2">
          <div className="flex-between mb-2">
            <h3 className="widget-title">📍 Map Pins</h3>
            <Link to="/map" className="btn btn-sm">🗺️ Open Map</Link>
          </div>
          {pins.length === 0 ? (
            <p className="text-muted">No pins on the map yet.</p>
          ) : (
            <div className="dm-list">
              {pins.map(pin => {
                const pinMap = maps.find(m => m.id === pin.mapId)
                return (
                  <div key={pin.id} className="dm-list-item">
                    <div className="dm-list-info">
                      <span className="dm-list-dot" style={{ background: pin.color }} />
                      <span className="dm-list-name">{pin.label}</span>
                      <span className="dm-list-detail">{pin.x}%, {pin.y}%</span>
                      {pinMap && (
                        <span className="dm-list-detail" style={{ fontSize: '0.75rem', color: 'var(--accent-gold)' }}>
                          {pinMap.name}
                        </span>
                      )}
                    </div>
                    <div className="dm-list-actions">
                      <button className="btn btn-sm btn-danger" onClick={() => handleDeletePin(pin.id)}>🗑️</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="card gold-border mb-2">
          <div className="flex-between mb-2">
            <h3 className="widget-title">📋 Questionnaires</h3>
            <Link to="/dm/questionnaire/new" className="btn btn-sm btn-primary">➕ New Form</Link>
          </div>
          {questionnaires.length === 0 ? (
            <p className="text-muted">No questionnaires yet.</p>
          ) : (
            <div className="dm-list">
              {questionnaires.map(q => (
                <div key={q.id} className="dm-list-item">
                  <div className="dm-list-info">
                    <span className="dm-list-name">{q.title}</span>
                    <span className="dm-list-detail">{q.questions?.length || 0} questions</span>
                  </div>
                  <div className="dm-list-actions">
                    <Link to={`/questionnaire/${q.id}`} className="btn btn-sm">📝 Fill</Link>
                    <Link to={`/dm/questionnaire/${q.id}`} className="btn btn-sm">✏️ Edit</Link>
                    <button className="btn btn-sm btn-danger" onClick={() => handleDeleteQuestionnaire(q.id)}>🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card gold-border mb-2">
          <h3 className="widget-title mb-2">📝 Guestbook Comments</h3>
          {(() => {
            const allComments = getAllComments()
            if (allComments.length === 0) {
              return <p className="text-muted">No comments yet.</p>
            }
            const recent = allComments.slice(0, 20)
            return (
              <div className="dm-list">
                {recent.map(c => {
                  const playerName = players.find(p => p.id === c.playerId)?.name || c.playerId
                  return (
                    <div key={c.id} className="dm-list-item">
                      <div className="dm-list-info">
                        <span className="dm-list-name" style={{ fontSize: '0.85rem' }}>{c.author}</span>
                        <span className="dm-list-detail" style={{ fontSize: '0.8rem' }}>
                          on {playerName} &middot; {new Date(c.timestamp).toLocaleDateString()}
                        </span>
                        <p className="text-muted" style={{ fontSize: '0.85rem', marginTop: 2 }}>{c.text}</p>
                      </div>
                      <div className="dm-list-actions">
                        <button className="btn btn-sm btn-danger" onClick={() => { deleteComment(c.id, c.playerId); refresh() }}>🗑️</button>
                      </div>
                    </div>
                  )
                })}
                {allComments.length > 20 && (
                  <p className="text-muted" style={{ fontSize: '0.85rem', marginTop: 8 }}>
                    Showing 20 of {allComments.length} comments
                  </p>
                )}
              </div>
            )
          })()}
        </div>
      </div>

      {showFullImport && (
        <Modal title="📂 Restore Full Backup" onClose={() => { setShowFullImport(false); setFullImportStatus('') }} large>
          <p className="mb-2 text-muted" style={{ fontSize: '0.85rem' }}>
            This will restore campaign data, users, and access requests. Use the "Full Backup" export to get the file.
          </p>
          <textarea
            value={fullImportText}
            onChange={e => setFullImportText(e.target.value)}
            placeholder="Paste your full backup JSON here..."
            rows={10}
            style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
          />
          {fullImportStatus && <p className="mt-1">{fullImportStatus}</p>}
          <div className="mt-2 text-center">
            <button className="btn btn-primary" onClick={handleFullImport}>Restore Full Backup</button>
          </div>
        </Modal>
      )}

      {showImport && (
        <Modal title="📥 Import Campaign Data" onClose={() => { setShowImport(false); setImportStatus('') }} large>
          <textarea
            value={importText}
            onChange={e => setImportText(e.target.value)}
            placeholder="Paste your exported JSON data here..."
            rows={10}
            style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
          />
          {importStatus && <p className="mt-1">{importStatus}</p>}
          <div className="mt-2 text-center">
            <button className="btn btn-primary" onClick={handleImport}>Import Data</button>
          </div>
        </Modal>
      )}

      {confirmReset && (
        <Modal title="⚠️ Reset All Data?" onClose={() => setConfirmReset(false)}>
          <p className="mb-2">This will delete ALL campaign data and restore defaults. This cannot be undone!</p>
          <div className="flex-between">
            <button className="btn" onClick={() => setConfirmReset(false)}>Cancel</button>
            <button className="btn btn-danger" onClick={handleReset}>💥 Reset Everything</button>
          </div>
        </Modal>
      )}

      {showUsers && (
        <Modal title="👥 Campaign Users" onClose={() => setShowUsers(false)} large>
          {users.length === 0 ? (
            <p className="text-muted">No users registered.</p>
          ) : (
            <div className="dm-list">
              {users.map(u => {
                const linkedPlayer = players.find(p => p.id === u.playerId)
                return (
                  <div key={u.id} className="dm-list-item">
                    <div className="dm-list-info">
                      <span className={`dm-list-dot ${u.role === 'dm' ? 'dm-role-dot' : ''}`}
                        style={{ background: u.role === 'dm' ? '#d4522a' : '#6a4cc9' }} />
                      <div>
                        <span className="dm-list-name">{u.username}</span>
                        <span className="dm-list-detail">
                          {u.role === 'dm' ? '⚔️ Dungeon Master' : '🎭 Player'}
                        </span>
                        {linkedPlayer && (
                          <span className="dm-list-detail" style={{ color: 'var(--accent-gold)' }}>
                            → {linkedPlayer.name}
                          </span>
                        )}
                        {u.role === 'player' && !linkedPlayer && (
                          <span className="dm-list-detail" style={{ color: 'var(--accent-fire)' }}>
                            No character linked
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="dm-list-actions">
                      <button className="btn btn-sm btn-danger" onClick={() => handleDeleteUser(u.id)}>🗑️</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {players.length > 0 && (
            <div className="mt-2">
              <p className="text-muted" style={{ fontSize: '0.85rem' }}>
                Unlinked players: {players.filter(p => !users.some(u => u.playerId === p.id)).map(p => p.name).join(', ') || 'none'}
              </p>
            </div>
          )}
        </Modal>
      )}

      {confirmUserDelete && (
        <Modal title="🗑️ Delete User?" onClose={() => setConfirmUserDelete(null)}>
          <p className="mb-2">Delete this user? This cannot be undone.</p>
          <div className="flex-between">
            <button className="btn" onClick={() => setConfirmUserDelete(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={() => { deleteUser(confirmUserDelete); setConfirmUserDelete(null); refresh() }}>🗑️ Delete</button>
          </div>
        </Modal>
      )}

      {showMapModal && (
        <Modal title={editingMap ? `✏️ Edit Map: ${editingMap.name}` : '🗺️ Add Map'} onClose={() => { setShowMapModal(false); setEditingMap(null) }}>
          <div className="mb-2">
            <label>Map Name</label>
            <input value={mapForm.name} onChange={e => setMapForm({ ...mapForm, name: e.target.value })} placeholder="Season 2 - The Frozen North" autoFocus />
          </div>
          <div className="mb-2">
            <label>Map Image URL (optional)</label>
            <input value={mapForm.imageUrl} onChange={e => setMapForm({ ...mapForm, imageUrl: e.target.value })} placeholder="https://example.com/new-map.jpg" />
            <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: 4 }}>
              Leave empty to use the default ContinentMap. Paste a direct link to a custom map image.
            </p>
          </div>
          <div className="text-center">
            <button className="btn btn-primary" onClick={handleSaveMap} disabled={!mapForm.name.trim()}>
              {editingMap ? '💾 Save' : '➕ Add'}
            </button>
          </div>
        </Modal>
      )}

      {confirmMapDelete && (
        <Modal title="🗑️ Delete Map" onClose={() => setConfirmMapDelete(null)}>
          <p className="mb-2">
            Delete <strong>{confirmMapDelete.name}</strong> and all its pins? This cannot be undone.
          </p>
          <div className="flex-between">
            <button className="btn" onClick={() => setConfirmMapDelete(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={() => handleDeleteMap(confirmMapDelete.id)}>🗑️ Delete</button>
          </div>
        </Modal>
      )}

      {selectedReq && (
        <Modal title="✅ Approve Access Request" onClose={() => setSelectedReq(null)}>
          <p className="mb-2">
            Approve <strong>{selectedReq.username}</strong> for which character?
          </p>
          <div className="mb-2">
            <label>Character</label>
            <select
              value={editingReqPlayer}
              onChange={e => setEditingReqPlayer(e.target.value)}
            >
              <option value="">— Select —</option>
              {players.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="flex-between">
            <button className="btn" onClick={() => setSelectedReq(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={confirmApprove} disabled={!editingReqPlayer}>
              ✅ Approve
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}


