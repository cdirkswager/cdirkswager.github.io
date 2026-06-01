import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  getPlayers, getMapPins, getQuestionnaires,
  deletePlayer, deleteMapPin, deleteQuestionnaire,
  exportData, importData, resetData,
} from '../../data/store'
import Modal from '../common/Modal'
import './DMTools.css'

export default function DMTools() {
  const [players, setPlayers] = useState([])
  const [pins, setPins] = useState([])
  const [questionnaires, setQuestionnaires] = useState([])
  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')
  const [importStatus, setImportStatus] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)

  const refresh = () => {
    setPlayers(getPlayers())
    setPins(getMapPins())
    setQuestionnaires(getQuestionnaires())
  }

  useEffect(() => { refresh() }, [])

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

  const handleReset = () => {
    resetData()
    setConfirmReset(false)
    refresh()
  }

  const handleDeletePlayer = (id) => {
    if (confirm('Delete this player? This cannot be undone.')) {
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
        </div>

        <div className="card gold-border mb-2">
          <div className="flex-between mb-2">
            <h3 className="widget-title">🎭 Players</h3>
            <Link to="/dm/players" className="btn btn-sm btn-primary">➕ Add Player</Link>
          </div>
          {players.length === 0 ? (
            <p className="text-muted">No players yet.</p>
          ) : (
            <div className="dm-list">
              {players.map(p => (
                <div key={p.id} className="dm-list-item">
                  <div className="dm-list-info">
                    <span className="dm-list-name">{p.name}</span>
                    <span className="dm-list-detail">{p.race} {p.class} &middot; Lvl {p.level}</span>
                  </div>
                  <div className="dm-list-actions">
                    <Link to={`/player/${p.id}`} className="btn btn-sm">👤 View</Link>
                    <Link to={`/dm/player/${p.id}`} className="btn btn-sm">✏️ Edit</Link>
                    <button className="btn btn-sm btn-danger" onClick={() => handleDeletePlayer(p.id)}>🗑️</button>
                  </div>
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
              {pins.map(pin => (
                <div key={pin.id} className="dm-list-item">
                  <div className="dm-list-info">
                    <span className="dm-list-dot" style={{ background: pin.color }} />
                    <span className="dm-list-name">{pin.label}</span>
                    <span className="dm-list-detail">{pin.x}%, {pin.y}%</span>
                  </div>
                  <div className="dm-list-actions">
                    <button className="btn btn-sm btn-danger" onClick={() => handleDeletePin(pin.id)}>🗑️</button>
                  </div>
                </div>
              ))}
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
      </div>

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
    </div>
  )
}
