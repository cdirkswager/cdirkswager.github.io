import { useState, useEffect, useRef, useCallback } from 'react'
import { getMapPins, saveMapPin, deleteMapPin, getPlayers } from '../../data/store'
import Modal from '../common/Modal'
import ContinentMap from '../../assets/ContinentMap.png'
import './MapPage.css'

export default function MapPage() {
  const [pins, setPins] = useState([])
  const [players, setPlayers] = useState([])
  const [selectedPin, setSelectedPin] = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [newPin, setNewPin] = useState({ x: 50, y: 50, label: '', description: '', color: '#c9a84c', addedBy: '' })
  const [placingMode, setPlacingMode] = useState(false)
  const [dragging, setDragging] = useState(null)
  const mapRef = useRef()

  const refresh = useCallback(() => {
    setPins(getMapPins())
    setPlayers(getPlayers())
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const handleMapClick = useCallback((e) => {
    if (!placingMode) return
    const rect = mapRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    setNewPin({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, label: '', description: '', color: '#c9a84c', addedBy: players[0]?.id || '' })
    setPlacingMode(false)
    setShowAddModal(true)
  }, [placingMode, players])

  const handleTouchPlace = useCallback((e) => {
    if (!placingMode) return
    e.preventDefault()
    const touch = e.touches[0]
    const rect = mapRef.current.getBoundingClientRect()
    const x = ((touch.clientX - rect.left) / rect.width) * 100
    const y = ((touch.clientY - rect.top) / rect.height) * 100
    setNewPin({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, label: '', description: '', color: '#c9a84c', addedBy: players[0]?.id || '' })
    setPlacingMode(false)
    setShowAddModal(true)
  }, [placingMode, players])

  const handlePinDrag = useCallback((e, pinId) => {
    const rect = mapRef.current.getBoundingClientRect()
    const clientX = e.clientX ?? e.touches?.[0]?.clientX
    const clientY = e.clientY ?? e.touches?.[0]?.clientY
    if (!clientX) return
    const x = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100))
    const y = Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100))
    setDragging({ id: pinId, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 })
  }, [])

  const handleDragEnd = useCallback(() => {
    if (dragging) {
      const pin = pins.find(p => p.id === dragging.id)
      if (pin) {
        saveMapPin({ ...pin, x: dragging.x, y: dragging.y })
        refresh()
      }
    }
    setDragging(null)
  }, [dragging, pins, refresh])

  useEffect(() => {
    if (!dragging) return
    const handleMove = (e) => {
      e.preventDefault()
      handlePinDrag(e, dragging.id)
    }
    const handleUp = () => handleDragEnd()
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    window.addEventListener('touchmove', handleMove, { passive: false })
    window.addEventListener('touchend', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
      window.removeEventListener('touchmove', handleMove)
      window.removeEventListener('touchend', handleUp)
    }
  }, [dragging, handlePinDrag, handleDragEnd])

  const savePin = () => {
    if (!newPin.label.trim()) return
    saveMapPin(newPin)
    setShowAddModal(false)
    setNewPin({ x: 50, y: 50, label: '', description: '', color: '#c9a84c', addedBy: '' })
    refresh()
  }

  const removePin = (id) => {
    deleteMapPin(id)
    setSelectedPin(null)
    refresh()
  }

  const getPlayerName = (playerId) => {
    return players.find(p => p.id === playerId)?.name || 'Unknown'
  }

  const pinColors = ['#c9a84c', '#d4522a', '#6a4cc9', '#4c9a6a', '#4c7ac9', '#c94c6a', '#c98a2a', '#6a9a4c']

  return (
    <div className="page">
      <div className="container">
        <div className="flex-between mb-2">
          <div>
            <h1 className="text-gold">🗺️ The Realm</h1>
            <p className="text-muted">Explore the continent and mark your discoveries</p>
          </div>
          <div className="map-actions">
            <button
              className={`btn ${placingMode ? 'btn-primary' : ''}`}
              onClick={() => { setPlacingMode(!placingMode); setSelectedPin(null) }}
            >
              {placingMode ? '🔖 Click Map to Pin' : '📍 Add Pin'}
            </button>
          </div>
        </div>

        <div className="map-container gold-border" ref={mapRef}>
          <img
            src={ContinentMap}
            alt="Continent Map"
            className="map-image"
            draggable={false}
          />
          <div
            className={`map-click-area ${placingMode ? 'placing' : ''}`}
            onClick={handleMapClick}
            onTouchEnd={handleTouchPlace}
          />
          {pins.map(pin => {
            const isDragging = dragging?.id === pin.id
            return (
              <div
                key={pin.id}
                className={`map-pin ${isDragging ? 'dragging' : ''}`}
                style={{
                  left: `${isDragging ? dragging.x : pin.x}%`,
                  top: `${isDragging ? dragging.y : pin.y}%`,
                  '--pin-color': pin.color,
                }}
                onClick={(e) => { e.stopPropagation(); setSelectedPin(pin) }}
                onMouseDown={(e) => { e.stopPropagation(); setDragging({ id: pin.id, x: pin.x, y: pin.y }) }}
                onTouchStart={(e) => { e.stopPropagation(); setDragging({ id: pin.id, x: pin.x, y: pin.y }) }}
              >
                <div className="pin-dot" />
              </div>
            )
          })}
        </div>

        <div className="pin-legend">
          {pinColors.map(c => (
            <div key={c} className="legend-item">
              <span className="legend-dot" style={{ background: c }} />
              <span className="legend-label">{pins.filter(p => p.color === c).length} pins</span>
            </div>
          ))}
        </div>
      </div>

      {selectedPin && (
        <Modal title={`📍 ${selectedPin.label}`} onClose={() => setSelectedPin(null)}>
          <div className="pin-detail">
            <div className="pin-detail-dot" style={{ background: selectedPin.color }} />
            <p className="text-muted mt-1">
              Added by: {getPlayerName(selectedPin.addedBy)}
            </p>
            {selectedPin.description && (
              <p className="mt-2">{selectedPin.description}</p>
            )}
            <p className="text-muted mt-1" style={{ fontSize: '0.8rem' }}>
              Position: {selectedPin.x}%, {selectedPin.y}%
            </p>
            <button className="btn btn-danger btn-sm mt-2" onClick={() => removePin(selectedPin.id)}>
              🗑️ Remove Pin
            </button>
          </div>
        </Modal>
      )}

      {showAddModal && (
        <Modal title="📍 New Pin" onClose={() => setShowAddModal(false)}>
          <div className="pin-form">
            <div className="mb-2">
              <label>Label</label>
              <input
                value={newPin.label}
                onChange={e => setNewPin({ ...newPin, label: e.target.value })}
                placeholder="e.g., The Dark Forest"
              />
            </div>
            <div className="mb-2">
              <label>Description</label>
              <textarea
                value={newPin.description}
                onChange={e => setNewPin({ ...newPin, description: e.target.value })}
                placeholder="What's at this location?"
              />
            </div>
            <div className="mb-2">
              <label>Color</label>
              <div className="color-picker">
                {pinColors.map(c => (
                  <button
                    key={c}
                    className={`color-swatch ${newPin.color === c ? 'active' : ''}`}
                    style={{ background: c }}
                    onClick={() => setNewPin({ ...newPin, color: c })}
                  />
                ))}
              </div>
            </div>
            <div className="mb-2">
              <label>Added By</label>
              <select
                value={newPin.addedBy}
                onChange={e => setNewPin({ ...newPin, addedBy: e.target.value })}
              >
                <option value="">DM</option>
                {players.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="flex-between">
              <p className="text-muted" style={{ fontSize: '0.8rem' }}>
                Position: {newPin.x}%, {newPin.y}%
              </p>
              <button className="btn btn-primary" onClick={savePin}>
                💾 Save Pin
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
