import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  getPlayers, getNPCs, getNPC, getMaps, getSortedMaps, getYears, getMapPins, getQuestionnaires,
  deletePlayer, deleteNPC, saveMap, deleteMap, deleteMapPin, deleteQuestionnaire,
  addYear, deleteYear, SEASON_NAMES,
  exportData, importData, resetData,
  exportFullData, importFullData,
  getAllComments, deleteComment,
  initStore, getCalendarData, getCalendarState, setCalendarState, getAllCalendarComments,
  deleteCalendarComment,
  getAllDowntimeChronicles, openDowntimeChronicle, closeDowntimeChronicle,
} from '../../data/store'
import {
  getAccessRequests, approveRequest, denyRequest,
  getAllUsers, deleteUser, setPlayerIdForUser,
  currentUser, getSession, logout as authLogout, unclaimPlayerId,
  approvePendingUser, assignPlayerToUser,
} from '../../data/auth'
import Modal from '../common/Modal'
import { useImpersonation } from '../../context/ImpersonationContext'
import './DMTools.css'

export default function DMTools() {
  const navigate = useNavigate()
  const { loginAs, impersonating } = useImpersonation()
  const [players, setPlayers] = useState([])
  const [selectedChroniclePlayers, setSelectedChroniclePlayers] = useState([])
  const [npcs, setNpcs] = useState([])
  const [maps, setMaps] = useState([])
  const [pins, setPins] = useState([])
  const [questionnaires, setQuestionnaires] = useState([])
  const [chronicles, setChronicles] = useState([])
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
  const [showSeasonModal, setShowSeasonModal] = useState(false)
  const [editingSeason, setEditingSeason] = useState(null)
  const [seasonForm, setSeasonForm] = useState({ name: '', imageUrl: '', year: 0, season: 0 })
  const [confirmSeasonDelete, setConfirmSeasonDelete] = useState(null)
  const [confirmYearDelete, setConfirmYearDelete] = useState(null)
  const [addSeasonYear, setAddSeasonYear] = useState(null)
  const [showAddYearModal, setShowAddYearModal] = useState(false)
  const [addYearValue, setAddYearValue] = useState('')
  const [confirmPinDelete, setConfirmPinDelete] = useState(null)
  const [confirmQuestionnaireDelete, setConfirmQuestionnaireDelete] = useState(null)
  const [confirmPlayerDelete, setConfirmPlayerDelete] = useState(null)
  const [confirmNPCDelete, setConfirmNPCDelete] = useState(null)
  const [confirmDenyReq, setConfirmDenyReq] = useState(null)
  // For assigning a character to a user directly from the Users modal
  const [assigningUser, setAssigningUser] = useState(null)
  const [assignPlayerId, setAssignPlayerId] = useState('')
  const [calendarData, setCalendarData] = useState(null)
  const [showCalendarPicker, setShowCalendarPicker] = useState(false)
  const [calPickerMonth, setCalPickerMonth] = useState(0)
  const [calPickerDay, setCalPickerDay] = useState(1)
  const [calPickerYear, setCalPickerYear] = useState(3102)
  const [confirmCalCommentDelete, setConfirmCalCommentDelete] = useState(null)

  // Re-fetches campaign data from the server, then updates all local state.
  // This is critical — getPlayers() etc. read from an in-memory cache that
  // only gets populated at startup. Without calling initStore() first, any
  // server-side changes (like a new player created by approve-registration)
  // won't appear until the page is hard-reloaded.
  const refresh = async () => {
    await initStore()
    setPlayers(getPlayers())
    setNpcs(getNPCs())
    setMaps(getMaps())
    setPins(getMapPins())
    setQuestionnaires(getQuestionnaires())
    setChronicles(getAllDowntimeChronicles())
    const [reqs, usrs] = await Promise.all([getAccessRequests(), getAllUsers()])
    if (reqs) setRequests(reqs)
    if (usrs) setUsers(usrs)
    setCalendarData(getCalendarData())
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

  const handleImport = async () => {
    if (await importData(importText)) {
      setImportStatus('✅ Data imported successfully!')
      refresh()
      setTimeout(() => { setShowImport(false); setImportStatus('') }, 1500)
    } else {
      setImportStatus('❌ Invalid data format. Please check the JSON.')
    }
  }

  const handleFullExport = async () => {
    const data = await exportFullData()
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `hunt-full-backup-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleFullImport = async () => {
    const result = await importFullData(fullImportText)
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

  const handleReset = async () => {
    await resetData()
    setConfirmReset(false)
    refresh()
  }

  const handleDeletePlayer = async (id) => {
    await unclaimPlayerId(id)
    await deletePlayer(id)
    setConfirmPlayerDelete(null)
    refresh()
  }

  const handleDeleteNPC = async (id) => {
    await deleteNPC(id)
    setConfirmNPCDelete(null)
    refresh()
  }

  const handleDeletePin = async (id) => {
    await deleteMapPin(id)
    setConfirmPinDelete(null)
    refresh()
  }

  const handleDeleteQuestionnaire = async (id) => {
    await deleteQuestionnaire(id)
    setConfirmQuestionnaireDelete(null)
    refresh()
  }

  const handleAddYear = () => {
    const maxYear = maps.reduce((max, m) => Math.max(max, m.year ?? -1), -1)
    setAddYearValue(maxYear >= 0 ? String(maxYear + 1) : '')
    setShowAddYearModal(true)
  }

  const confirmAddYear = async () => {
    const yearNum = parseInt(addYearValue)
    if (isNaN(yearNum)) return
    await addYear(yearNum)
    setShowAddYearModal(false)
    refresh()
  }

  const handleEditSeason = (map) => {
    setEditingSeason(map)
    setSeasonForm({ name: map.name, imageUrl: map.imageUrl || '', year: map.year ?? 0, season: map.season ?? 0 })
    setShowSeasonModal(true)
  }

  const handleSaveSeason = async () => {
    if (!seasonForm.name.trim()) return
    const existing = editingSeason
    if (existing) {
      await saveMap({ ...existing, name: seasonForm.name.trim(), imageUrl: seasonForm.imageUrl.trim() })
    } else {
      await saveMap({ name: seasonForm.name.trim(), imageUrl: seasonForm.imageUrl.trim(), year: addSeasonYear ?? 0 })
    }
    setShowSeasonModal(false)
    setEditingSeason(null)
    setAddSeasonYear(null)
    refresh()
  }

  const handleDeleteSeason = async (id) => {
    await deleteMap(id)
    setConfirmSeasonDelete(null)
    refresh()
  }

  const handleDeleteYear = async (year) => {
    await deleteYear(year)
    setConfirmYearDelete(null)
    refresh()
  }

  const handleApprove = (req) => {
    setSelectedReq(req)
    setEditingReqPlayer(req.playerId || '')
  }

  const confirmApprove = async () => {
    if (!selectedReq || !editingReqPlayer) return
    await approveRequest(selectedReq.id, editingReqPlayer)
    setPlayerIdForUser(selectedReq.username, editingReqPlayer)
    setSelectedReq(null)
    refresh()
  }

  const handleDeny = async (reqId) => {
    await denyRequest(reqId)
    setConfirmDenyReq(null)
    refresh()
  }

  const handleDeleteUser = async (userId) => {
    const session = currentUser()
    if (session && session.userId === userId) {
      await deleteUser(userId)
      await authLogout()
      navigate('/')
      return
    }
    setConfirmUserDelete(userId)
  }

  // Directly assign an existing character to a user from the Users modal.
  // This covers the case where a DM created a character manually and wants
  // to link it to a registered user without going through the access request flow.
  const handleAssignPlayer = (user) => {
    setAssigningUser(user)
    setAssignPlayerId(user.playerId || '')
  }

  const confirmAssignPlayer = async () => {
    if (!assigningUser) return
    await assignPlayerToUser(assigningUser.id, assignPlayerId || null)
    setAssigningUser(null)
    setAssignPlayerId('')
    refresh()
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
            <Link to="/dm/dnd/combat" className="btn btn-sm" style={{borderColor:'var(--accent-magic)', color:'var(--accent-magic)'}}>🎲 D&D Combat Tool</Link>
            <button className="btn btn-sm btn-danger" onClick={() => setConfirmReset(true)}>⚠️ Reset</button>
          </div>
        </div>

        <div className="dm-stats">
          <div className="dm-stat-card card gold-border">
            <span className="dm-stat-number">{players.length}</span>
            <span className="dm-stat-label">Adventurers</span>
          </div>
          <div className="dm-stat-card card gold-border">
            <span className="dm-stat-number">{npcs.length}</span>
            <span className="dm-stat-label">NPCs</span>
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

        {users.filter(u => u.role === 'pending').length > 0 && (
          <div className="card gold-border mb-2" style={{ borderColor: '#4a9eff' }}>
            <div className="flex-between mb-2">
              <h3 className="widget-title" style={{ color: '#4a9eff' }}>
                🆕 Character Requests ({users.filter(u => u.role === 'pending').length})
              </h3>
            </div>
            <div className="dm-list">
              {users.filter(u => u.role === 'pending').map(u => (
                <div key={u.id} className="dm-list-item">
                  <div className="dm-list-info">
                    <span className="dm-list-dot" style={{ background: '#4a9eff' }} />
                    <div>
                      <span className="dm-list-name">{u.username}</span>
                      <span className="dm-list-detail">
                        wants to play: <strong>{u.proposedName || 'Unknown'}</strong>
                      </span>
                    </div>
                  </div>
                  <div className="dm-list-actions">
                    <button className="btn btn-sm btn-primary" onClick={async () => {
                      await approvePendingUser(u.id)
                      refresh()
                    }}>
                      ✅ Approve
                    </button>
                    <button className="btn btn-sm btn-danger" onClick={async () => {
                      await deleteUser(u.id)
                      refresh()
                    }}>
                      ❌ Deny
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

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
                    <button className="btn btn-sm btn-danger" onClick={() => setConfirmDenyReq(req)}>
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
                      <button className="btn btn-sm btn-danger" onClick={() => setConfirmPlayerDelete(p)}>🗑️</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="card gold-border mb-2">
          <div className="flex-between mb-2">
            <h3 className="widget-title">📜 Nobles &amp; NPCs</h3>
            <Link to="/dm/npc/new" className="btn btn-sm btn-primary">➕ Create NPC</Link>
          </div>
          {npcs.length === 0 ? (
            <p className="text-muted">No NPCs yet.</p>
          ) : (
            <div className="dm-list">
              {npcs.map(n => (
                <div key={n.id} className="dm-list-item">
                  <div className="dm-list-info">
                    <span className="dm-list-name">{n.name}</span>
                    <span className="dm-list-detail">{n.race} {n.class} &middot; Lvl {n.level}</span>
                  </div>
                  <div className="dm-list-actions">
                    <Link to={`/player/${n.id}`} className="btn btn-sm">👤 View</Link>
                    <Link to={`/dm/npc/${n.id}`} className="btn btn-sm">✏️ Edit</Link>
                    <button className="btn btn-sm" onClick={() => loginAs(n)} style={impersonating?.id === n.id ? { borderColor: 'var(--accent-magic)', color: 'var(--accent-magic)' } : {}}>
                      {impersonating?.id === n.id ? '🎭 Active' : '🎭 Log in'}
                    </button>
                    <button className="btn btn-sm btn-danger" onClick={() => setConfirmNPCDelete(n)}>🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card gold-border mb-2">
          <div className="flex-between mb-2">
            <h3 className="widget-title">🗺️ Timeline</h3>
            <button className="btn btn-sm btn-primary" onClick={handleAddYear}>➕ Add Year</button>
          </div>
          {maps.length === 0 ? (
            <p className="text-muted">No timeline layers yet.</p>
          ) : (
            <div className="dm-list">
              {getYears().map(({ year, seasons }) => (
                <div key={year} className="dm-year-group">
                  <div className="dm-year-header">
                    <span className="dm-year-title">📅 Year {year}</span>
                    <button className="btn btn-sm btn-danger" onClick={() => setConfirmYearDelete(year)} title="Delete this year and all its seasons">🗑️ Year</button>
                  </div>
                  {seasons.map(m => {
                    const seasonPinCount = pins.filter(p => p.mapId === m.id).length
                    return (
                      <div key={m.id} className="dm-list-item dm-season-item">
                        <div className="dm-list-info">
                          <span className="dm-season-icon">
                            {m.season === 0 ? '🌱' : m.season === 1 ? '☀️' : m.season === 2 ? '🍂' : '❄️'}
                          </span>
                          <div>
                            <span className="dm-list-name">{m.name}</span>
                            <span className="dm-list-detail">{seasonPinCount} pin{seasonPinCount !== 1 ? 's' : ''}</span>
                            {m.imageUrl && <span className="dm-list-detail" style={{ fontSize: '0.75rem' }}>custom image</span>}
                          </div>
                        </div>
                        <div className="dm-list-actions">
                          <Link to="/map" className="btn btn-sm">🗺️</Link>
                          <button className="btn btn-sm" onClick={() => handleEditSeason(m)}>✏️</button>
                          <button className="btn btn-sm btn-danger" onClick={() => setConfirmSeasonDelete(m)}>🗑️</button>
                        </div>
                      </div>
                    )
                  })}
                  <button className="btn btn-sm dm-add-season-btn" onClick={() => { setAddSeasonYear(year); setEditingSeason(null); setSeasonForm({ name: '', imageUrl: '', year, season: 0 }); setShowSeasonModal(true) }}>
                    ➕ Add Season to Year {year}
                  </button>
                </div>
              ))}
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
                          {pinMap.name} {pinMap.year !== undefined ? `(Year ${pinMap.year})` : ''}
                        </span>
                      )}
                    </div>
                    <div className="dm-list-actions">
                      <button className="btn btn-sm btn-danger" onClick={() => setConfirmPinDelete(pin)}>🗑️</button>
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
                    <button className="btn btn-sm btn-danger" onClick={() => setConfirmQuestionnaireDelete(q)}>🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card gold-border mb-2">
          <div className="flex-between mb-2">
            <h3 className="widget-title">📜 Downtime Chronicles</h3>
            <div className="flex" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <select
                multiple
                value={selectedChroniclePlayers}
                onChange={e => setSelectedChroniclePlayers([...e.target.options].filter(o => o.selected).map(o => o.value))}
                style={{ minWidth: 140, maxHeight: 120, background: '#1a1510', color: '#e0d5c1', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 3, padding: 4, fontSize: '0.78rem' }}
              >
                {getPlayers().filter(p => !p.id.startsWith('npc-')).map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <button className="btn btn-sm" onClick={async () => {
                if (selectedChroniclePlayers.length === 0) return
                await openDowntimeChronicle(selectedChroniclePlayers, '')
                setSelectedChroniclePlayers([])
                refresh()
              }} disabled={selectedChroniclePlayers.length === 0}>
                📢 Open Selected ({selectedChroniclePlayers.length})
              </button>
              <button className="btn btn-sm btn-primary" onClick={async () => {
                const allPlayers = getPlayers().filter(p => !p.id.startsWith('npc-'))
                await openDowntimeChronicle(allPlayers.map(p => p.id), '')
                setSelectedChroniclePlayers([])
                refresh()
              }}>
                📢 Open for All Players
              </button>
            </div>
          </div>
          {chronicles.length === 0 ? (
            <p className="text-muted">No downtime chronicles yet. Click "Open for All Players" to begin.</p>
          ) : (
            <div className="dm-list">
              {chronicles.map(c => {
                const p = getPlayers().find(pl => pl.id === c.playerId)
                return (
                  <div key={c.id} className="dm-list-item">
                    <div className="dm-list-info">
                      <span className="dm-list-name">{p?.name || c.playerId}</span>
                      <span className={`dm-list-detail ${c.status === 'submitted' ? 'text-success' : c.status === 'pending' ? 'text-gold' : ''}`}>
                        {c.status === 'submitted' && '✅ Submitted'}
                        {c.status === 'pending' && '⏳ Pending'}
                        {c.status === 'closed' && '🔒 Closed'}
                        {c.data?.name ? ` — ${c.data.name}` : ''}
                      </span>
                    </div>
                    <div className="dm-list-actions">
                      <Link to={`/player/${c.playerId}/downtime`} className="btn btn-sm">👁️ View</Link>
                      {c.status === 'pending' && (
                        <button className="btn btn-sm" onClick={async () => {
                          await closeDowntimeChronicle(c.playerId)
                          refresh()
                        }}>🔒 Close</button>
                      )}
                      {c.status === 'submitted' && (
                        <button className="btn btn-sm" onClick={async () => {
                          await openDowntimeChronicle([c.playerId], '')
                          refresh()
                        }}>🔓 Reopen</button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {calendarData && (
          <div className="card gold-border mb-2">
            <div className="flex-between mb-2">
              <h3 className="widget-title">📅 Calendar</h3>
              <button className="btn btn-sm" onClick={() => {
                setCalPickerMonth(calendarData.state.month)
                setCalPickerDay(calendarData.state.day)
                setCalPickerYear(calendarData.state.year)
                setShowCalendarPicker(true)
              }}>📅 Set Date</button>
            </div>
            <p style={{ marginBottom: 8 }}>
              Current: <strong>{['Hammer','Alturiak','Ches','Tarsakh','Mirtul','Kythorn','Flamerule','Eleasis','Eleint','Marpenoth','Uktar','Nightal'][calendarData.state.month]} {calendarData.state.day}, Year {calendarData.state.year}</strong>
              &middot; {calendarData.events.length} events total
            </p>
            {(() => {
              const allCalComments = getAllCalendarComments()
              if (allCalComments.length === 0) return <p className="text-muted">No calendar comments yet.</p>
              const recent = allCalComments.slice(0, 10)
              const dayNames = ['Day of the Sun','Day of the Moon','Day of Mysteries','Day of Justice','Day of the Wild','Day of the Book','Day of Grain','Day of Strife','Day of the Dead','Day of Love']
              return (
                <div className="dm-list">
                  {recent.map(c => (
                    <div key={c.id} className="dm-list-item">
                      <div className="dm-list-info">
                        <span className="dm-list-name" style={{fontSize:'0.85rem'}}>{c.author}</span>
                        <span className="dm-list-detail" style={{fontSize:'0.8rem'}}>
                          on {['Hammer','Alturiak','Ches','Tarsakh','Mirtul','Kythorn','Flamerule','Eleasis','Eleint','Marpenoth','Uktar','Nightal'][c.month]} {c.day} ({dayNames[(c.day - 1) % 10]}) &middot; {new Date(c.timestamp).toLocaleDateString()}
                        </span>
                        <p className="text-muted" style={{fontSize:'0.85rem', marginTop:2}}>{c.text}</p>
                      </div>
                      <div className="dm-list-actions">
                        <button className="btn btn-sm btn-danger" onClick={async () => { await deleteCalendarComment(c.id, c.month, c.day); refresh() }}>🗑️</button>
                      </div>
                    </div>
                  ))}
                  {allCalComments.length > 10 && (
                    <p className="text-muted" style={{fontSize:'0.85rem', marginTop:8}}>Showing 10 of {allCalComments.length} comments</p>
                  )}
                </div>
              )
            })()}
          </div>
        )}

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
                  const playerName = players.find(p => p.id === c.playerId)?.name || npcs.find(n => n.id === c.playerId)?.name || c.playerId
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
                        <button className="btn btn-sm btn-danger" onClick={async () => { await deleteComment(c.id, c.playerId); refresh() }}>🗑️</button>
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
                      <span
                        className={`dm-list-dot ${u.role === 'dm' ? 'dm-role-dot' : ''}`}
                        style={{ background: u.role === 'dm' ? '#d4522a' : u.role === 'pending' ? '#4a9eff' : '#6a4cc9' }}
                      />
                      <div>
                        <span className="dm-list-name">{u.username}</span>
                        <span className="dm-list-detail">
                          {u.role === 'dm' ? '⚔️ Dungeon Master' : u.role === 'pending' ? '⏳ Pending Approval' : '🎭 Player'}
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
                      {u.role === 'player' && (
                        <button className="btn btn-sm" onClick={() => handleAssignPlayer(u)}>
                          🔗 Assign
                        </button>
                      )}
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
            <button className="btn btn-danger" onClick={async () => { await deleteUser(confirmUserDelete); setConfirmUserDelete(null); refresh() }}>🗑️ Delete</button>
          </div>
        </Modal>
      )}

      {assigningUser && (
        <Modal title="🔗 Assign Character" onClose={() => { setAssigningUser(null); setAssignPlayerId('') }}>
          <p className="mb-2">
            Assign a character to <strong>{assigningUser.username}</strong>:
          </p>
          <div className="mb-2">
            <label>Character</label>
            <select value={assignPlayerId} onChange={e => setAssignPlayerId(e.target.value)}>
              <option value="">— None (unlink) —</option>
              {players
                .filter(p => !users.some(u => u.playerId === p.id && u.id !== assigningUser.id))
                .map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
            </select>
          </div>
          <div className="flex-between">
            <button className="btn" onClick={() => { setAssigningUser(null); setAssignPlayerId('') }}>Cancel</button>
            <button className="btn btn-primary" onClick={confirmAssignPlayer}>
              🔗 Save
            </button>
          </div>
        </Modal>
      )}

      {showSeasonModal && (
        <Modal title={editingSeason ? `✏️ Edit: ${editingSeason.name}` : '➕ Add Season'} onClose={() => { setShowSeasonModal(false); setEditingSeason(null); setAddSeasonYear(null) }}>
          <div className="mb-2">
            <label>Season Name</label>
            <input value={seasonForm.name} onChange={e => setSeasonForm({ ...seasonForm, name: e.target.value })} placeholder="Spring, The Thaw, etc." autoFocus />
          </div>
          <div className="mb-2">
            <label>Map Image URL (optional)</label>
            <input value={seasonForm.imageUrl} onChange={e => setSeasonForm({ ...seasonForm, imageUrl: e.target.value })} placeholder="https://example.com/season-map.jpg" />
            <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: 4 }}>
              Leave empty to use the default ContinentMap.
            </p>
          </div>
          {!editingSeason && addSeasonYear !== null && (
            <p className="text-muted" style={{ fontSize: '0.85rem' }}>
              Adding to <strong>Year {addSeasonYear}</strong>
            </p>
          )}
          <div className="text-center">
            <button className="btn btn-primary" onClick={handleSaveSeason} disabled={!seasonForm.name.trim()}>
              {editingSeason ? '💾 Save' : '➕ Add'}
            </button>
          </div>
        </Modal>
      )}

      {confirmSeasonDelete && (
        <Modal title="🗑️ Delete Season" onClose={() => setConfirmSeasonDelete(null)}>
          <p className="mb-2">
            Delete <strong>{confirmSeasonDelete.name}</strong> and all its pins? This cannot be undone.
          </p>
          <div className="flex-between">
            <button className="btn" onClick={() => setConfirmSeasonDelete(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={() => handleDeleteSeason(confirmSeasonDelete.id)}>🗑️ Delete</button>
          </div>
        </Modal>
      )}

      {showAddYearModal && (
        <Modal title="📅 Add Year" onClose={() => setShowAddYearModal(false)}>
          <div className="mb-2">
            <label>Year Number</label>
            <input value={addYearValue} onChange={e => setAddYearValue(e.target.value)} placeholder="1450" type="number" autoFocus />
            <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: 4 }}>
              Sets the origin year for the new campaign era. Seasons will increment from this base.
            </p>
          </div>
          <div className="flex-between">
            <button className="btn" onClick={() => setShowAddYearModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={confirmAddYear} disabled={!addYearValue.trim()}>
              ➕ Add {SEASON_NAMES.length} Seasons
            </button>
          </div>
        </Modal>
      )}

      {confirmYearDelete && (
        <Modal title="🗑️ Delete Year" onClose={() => setConfirmYearDelete(null)}>
          <p className="mb-2">
            Delete <strong>Year {confirmYearDelete}</strong> and all its seasons and pins? This cannot be undone.
          </p>
          <div className="flex-between">
            <button className="btn" onClick={() => setConfirmYearDelete(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={() => handleDeleteYear(confirmYearDelete)}>🗑️ Delete All Seasons</button>
          </div>
        </Modal>
      )}

      {confirmPlayerDelete && (
        <Modal title="🗑️ Delete Player" onClose={() => setConfirmPlayerDelete(null)}>
          <p className="mb-2">Delete <strong>{confirmPlayerDelete.name}</strong> and unlink their user? This cannot be undone.</p>
          <div className="flex-between">
            <button className="btn" onClick={() => setConfirmPlayerDelete(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={() => handleDeletePlayer(confirmPlayerDelete.id)}>🗑️ Delete</button>
          </div>
        </Modal>
      )}

      {confirmNPCDelete && (
        <Modal title="🗑️ Delete NPC" onClose={() => setConfirmNPCDelete(null)}>
          <p className="mb-2">Delete NPC <strong>{confirmNPCDelete.name}</strong> and all their comments? This cannot be undone.</p>
          <div className="flex-between">
            <button className="btn" onClick={() => setConfirmNPCDelete(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={() => handleDeleteNPC(confirmNPCDelete.id)}>🗑️ Delete</button>
          </div>
        </Modal>
      )}

      {confirmPinDelete && (
        <Modal title="🗑️ Delete Pin" onClose={() => setConfirmPinDelete(null)}>
          <p className="mb-2">Delete <strong>{confirmPinDelete.label}</strong> from the map? This cannot be undone.</p>
          <div className="flex-between">
            <button className="btn" onClick={() => setConfirmPinDelete(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={() => handleDeletePin(confirmPinDelete.id)}>🗑️ Delete</button>
          </div>
        </Modal>
      )}

      {confirmDenyReq && (
        <Modal title="❌ Deny Access Request" onClose={() => setConfirmDenyReq(null)}>
          <p className="mb-2">Deny access request from <strong>{confirmDenyReq.username}</strong>?</p>
          <div className="flex-between">
            <button className="btn" onClick={() => setConfirmDenyReq(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={() => handleDeny(confirmDenyReq.id)}>❌ Deny</button>
          </div>
        </Modal>
      )}

      {confirmQuestionnaireDelete && (
        <Modal title="🗑️ Delete Questionnaire" onClose={() => setConfirmQuestionnaireDelete(null)}>
          <p className="mb-2">Delete <strong>{confirmQuestionnaireDelete.title}</strong> and all its responses? This cannot be undone.</p>
          <div className="flex-between">
            <button className="btn" onClick={() => setConfirmQuestionnaireDelete(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={() => handleDeleteQuestionnaire(confirmQuestionnaireDelete.id)}>🗑️ Delete</button>
          </div>
        </Modal>
      )}

      {showCalendarPicker && (
        <Modal title="📅 Set Calendar Date" onClose={() => setShowCalendarPicker(false)}>
          <div className="mb-2">
            <label>Month</label>
            <select value={calPickerMonth} onChange={e => setCalPickerMonth(parseInt(e.target.value))}>
              {['Hammer','Alturiak','Ches','Tarsakh','Mirtul','Kythorn','Flamerule','Eleasis','Eleint','Marpenoth','Uktar','Nightal'].map((name, i) => (
                <option key={i} value={i}>{name}</option>
              ))}
            </select>
          </div>
          <div className="mb-2">
            <label>Day</label>
            <input type="number" min={1} max={30} value={calPickerDay} onChange={e => setCalPickerDay(Math.min(30, Math.max(1, parseInt(e.target.value) || 1)))} />
          </div>
          <div className="mb-2">
            <label>Year</label>
            <input type="number" value={calPickerYear} onChange={e => setCalPickerYear(parseInt(e.target.value) || 3102)} />
          </div>
          <div className="flex-between">
            <button className="btn" onClick={() => setShowCalendarPicker(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={async () => {
              await setCalendarState({ year: calPickerYear, month: calPickerMonth, day: calPickerDay })
              setShowCalendarPicker(false)
              refresh()
            }}>📅 Set Date</button>
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
