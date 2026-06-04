import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { getSortedMaps, getMaps, getMapPins, saveMapPin, deleteMapPin, getPlayers } from '../../data/store'
import { currentUser } from '../../data/auth'
import Modal from '../common/Modal'
import ContinentMap from '../../assets/ContinentMap.png'
import './MapPage.css'

const pinColors = ['#c9a84c', '#d4522a', '#6a4cc9', '#4c9a6a', '#4c7ac9', '#c94c6a', '#c98a2a', '#6a9a4c']

export default function MapPage() {
  const [maps, setMaps] = useState([])
  const [selectedMapId, setSelectedMapId] = useState(null)
  const [timelineIndex, setTimelineIndex] = useState(0)
  const [pins, setPins] = useState([])
  const [allPinsCache, setAllPinsCache] = useState({})
  const [players, setPlayers] = useState([])
  const [selectedPin, setSelectedPin] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({ label: '', description: '', color: '#c9a84c' })
  const [placingPos, setPlacingPos] = useState(null)
  const [tooltipPin, setTooltipPin] = useState(null)
  const [dragging, setDragging] = useState(null)
  const [dragStart, setDragStart] = useState(null)
  const [editPin, setEditPin] = useState(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [confirmDeletePin, setConfirmDeletePin] = useState(null)
  const [focusedPin, setFocusedPin] = useState(null)
  const [showPinList, setShowPinList] = useState(false)
  const [mobilePinDetail, setMobilePinDetail] = useState(null)
  const mapAreaRef = useRef()
  const mapContentRef = useRef()
  const longPressTimer = useRef(null)

  const sortedMaps = useMemo(() => getSortedMaps(), [maps])
  const yearGroups = useMemo(() => {
    const groups = []
    sortedMaps.forEach((m, i) => {
      const y = m.year ?? 0
      if (!groups.length || groups[groups.length - 1].year !== y) {
        groups.push({ year: y, startIndex: i, count: 0 })
      }
      groups[groups.length - 1].count++
    })
    return groups
  }, [sortedMaps])

  const currentMap = sortedMaps[timelineIndex] || null

  const prevPins = useMemo(() => {
    if (timelineIndex <= 0) return []
    const prevMap = sortedMaps[timelineIndex - 1]
    return prevMap ? allPinsCache[prevMap.id] || [] : []
  }, [timelineIndex, sortedMaps, allPinsCache])

  const refresh = useCallback(() => {
    setPlayers(getPlayers())
    if (selectedMapId) {
      const freshPins = getMapPins(selectedMapId)
      setPins(freshPins)
      setAllPinsCache(prev => ({ ...prev, [selectedMapId]: freshPins }))
    }
  }, [selectedMapId])

  useEffect(() => {
    const loadedMaps = getMaps()
    setMaps(loadedMaps)
    if (loadedMaps.length > 0) {
      const sorted = getSortedMaps()
      const lastIdx = sorted.length - 1
      setTimelineIndex(lastIdx)
      setSelectedMapId(sorted[lastIdx].id)
    }
    setPlayers(getPlayers())
  }, [])

  useEffect(() => {
    if (selectedMapId) {
      const freshPins = getMapPins(selectedMapId)
      setPins(freshPins)
      setAllPinsCache(prev => ({ ...prev, [selectedMapId]: freshPins }))
      setTooltipPin(null)
      setShowForm(false)
      setPlacingPos(null)
    }
  }, [selectedMapId])

  useEffect(() => {
    if (sortedMaps[timelineIndex]) {
      setSelectedMapId(sortedMaps[timelineIndex].id)
    }
  }, [timelineIndex, sortedMaps])

  useEffect(() => {
    const cache = {}
    sortedMaps.forEach(m => {
      cache[m.id] = getMapPins(m.id)
    })
    setAllPinsCache(prev => ({ ...prev, ...cache }))
  }, [sortedMaps])

  const session = currentUser()
  const canModifyPin = useCallback((pin) => {
    if (!session) return false
    if (session.role === 'dm') return true
    const currentId = session.playerId || session.username
    return pin.addedBy === currentId
  }, [session])

  const getPosFromEvent = useCallback((e) => {
    const content = mapContentRef.current
    if (!content) return { x: 50, y: 50, inside: false }
    const rect = content.getBoundingClientRect()
    const cx = e.clientX ?? e.touches?.[0]?.clientX ?? 0
    const cy = e.clientY ?? e.touches?.[0]?.clientY ?? 0
    const relX = (cx - rect.left) / rect.width
    const relY = (cy - rect.top) / rect.height
    const inside = relX >= 0 && relX <= 1 && relY >= 0 && relY <= 1
    return {
      x: Math.min(100, Math.max(0, Math.round(relX * 1000) / 10)),
      y: Math.min(100, Math.max(0, Math.round(relY * 1000) / 10)),
      inside,
    }
  }, [])

  const handleMapTap = useCallback((e) => {
    if (dragging) return
    if (!session) return
    const pos = getPosFromEvent(e)
    if (!pos.inside) return
    const tapped = pins.find(p =>
      Math.abs(p.x - pos.x) < 4 && Math.abs(p.y - pos.y) < 4
    )
    if (tapped) {
      setTooltipPin(tapped)
      setPlacingPos(null)
      return
    }
    setTooltipPin(null)
    setPlacingPos(pos)
    setFormData({ label: '', description: '', color: '#c9a84c' })
    setShowForm(true)
  }, [pins, dragging, getPosFromEvent, session])

  const handleMapTouchStart = useCallback((e) => {
    if (!session) return
    if (e.touches.length > 1) return
    const touch = e.touches[0]
    const el = document.elementFromPoint(touch.clientX, touch.clientY)
    if (el?.closest('.map-pin')) return
    const pos = getPosFromEvent({ clientX: touch.clientX, clientY: touch.clientY })
    if (!pos.inside) return
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
    longPressTimer.current = setTimeout(() => {
      handleMapTap({ clientX: touch.clientX, clientY: touch.clientY })
    }, 500)
  }, [handleMapTap, getPosFromEvent, session])

  const cancelLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }, [])

  const handlePinPointerDown = useCallback((e, pin) => {
    if (!session) return
    e.stopPropagation()
    setTooltipPin(pin)
    const pos = getPosFromEvent(e)
    setDragStart({ x: pos.x, y: pos.y, id: pin.id, pinX: pin.x, pinY: pin.y })
  }, [getPosFromEvent, session])

  const handlePinTap = useCallback((e, pin) => {
    e.stopPropagation()
    setTooltipPin(pin)
    if (window.innerWidth <= 768) {
      setMobilePinDetail(pin)
    }
  }, [])

  useEffect(() => {
    if (!dragStart) return
    const handleMove = (e) => {
      e.preventDefault()
      const pos = getPosFromEvent(e)
      const dx = pos.x - dragStart.x
      const dy = pos.y - dragStart.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist > 2) {
        setDragging({
          id: dragStart.id,
          x: Math.min(100, Math.max(0, Math.round((dragStart.pinX + dx) * 10) / 10)),
          y: Math.min(100, Math.max(0, Math.round((dragStart.pinY + dy) * 10) / 10)),
        })
      }
    }
    const handleUp = async () => {
      if (dragging && dragStart) {
        const pin = pins.find(p => p.id === dragging.id)
        if (pin) {
          await saveMapPin({ ...pin, x: dragging.x, y: dragging.y })
          refresh()
        }
      }
      setDragging(null)
      setDragStart(null)
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current)
        longPressTimer.current = null
      }
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    window.addEventListener('touchmove', handleMove, { passive: false })
    window.addEventListener('touchend', handleUp)
    window.addEventListener('touchcancel', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
      window.removeEventListener('touchmove', handleMove)
      window.removeEventListener('touchend', handleUp)
      window.removeEventListener('touchcancel', handleUp)
    }
  }, [dragStart, dragging, pins, refresh, getPosFromEvent])

  const saveNewPin = async () => {
    if (!formData.label.trim() || !selectedMapId) return
    await saveMapPin({
      mapId: selectedMapId,
      x: placingPos.x,
      y: placingPos.y,
      label: formData.label.trim(),
      description: formData.description.trim(),
      color: formData.color,
      addedBy: session?.playerId || session?.username || '',
    })
    setShowForm(false)
    setPlacingPos(null)
    setFormData({ label: '', description: '', color: '#c9a84c' })
    refresh()
  }

  const openEditPin = (pin) => {
    if (!canModifyPin(pin)) return
    setEditPin(pin)
    setFormData({ label: pin.label, description: pin.description || '', color: pin.color })
    setShowEditModal(true)
    setTooltipPin(null)
  }

  const saveEditPin = async () => {
    if (!formData.label.trim() || !editPin) return
    await saveMapPin({ ...editPin, label: formData.label.trim(), description: formData.description.trim(), color: formData.color })
    setShowEditModal(false)
    setEditPin(null)
    setSelectedPin(null)
    refresh()
  }

  const removePin = async (id) => {
    await deleteMapPin(id)
    setSelectedPin(null)
    setTooltipPin(null)
    setShowEditModal(false)
    setConfirmDeletePin(null)
    setEditPin(null)
    refresh()
  }

  const pinStyle = useCallback((pin, isGhost) => {
    const isDragging = dragging?.id === pin.id
    return {
      left: `${isDragging ? dragging.x : pin.x}%`,
      top: `${isDragging ? dragging.y : pin.y}%`,
      '--pin-color': pin.color,
      opacity: isGhost ? 0.15 : undefined,
      pointerEvents: isGhost ? 'none' : undefined,
    }
  }, [dragging])

  return (
    <div className="map-page">
      <div className="map-header">
        <div className="map-header-left">
          <h1 className="map-title">
            {currentMap ? (
               <>📅 Year {currentMap.year ?? '?'} &mdash; {currentMap.name}</>
            ) : (
              <>🗺️ The Realm</>
            )}
          </h1>
        </div>
        <div className="map-header-center">
          <span className="map-pin-count">
            {sortedMaps[timelineIndex]?.name || ''} &middot; {pins.length} pin{pins.length !== 1 ? 's' : ''}
            {prevPins.length > 0 && <> +{prevPins.length} prev</>}
          </span>
        </div>
        {!showForm && selectedMapId && session && (
          <button className="btn btn-primary btn-sm map-add-btn" onClick={() => setShowForm(true)}>
            📍 Add Pin
          </button>
        )}
      </div>

      <div className="map-area" ref={mapAreaRef}>
        <div className="map-content" ref={mapContentRef}>
          <img
            src={currentMap?.imageUrl || ContinentMap}
            alt={currentMap?.name || 'Map'}
            className="map-image"
            draggable={false}
          />
          <div className="map-border" />
          <div
            className={`map-touch-layer ${placingPos ? 'placing' : ''}`}
            tabIndex={0}
            role="application"
            aria-label="Campaign map. Press Enter to add a pin at the center. Use arrow keys to move the focused pin."
            onClick={handleMapTap}
            onKeyDown={async (e) => {
              if (session && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault()
                const center = getPosFromEvent({ clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 })
                setTooltipPin(null)
                setPlacingPos(center)
                setFormData({ label: '', description: '', color: '#c9a84c' })
                setShowForm(true)
              }
              if (session && e.key.startsWith('Arrow') && focusedPin) {
                e.preventDefault()
                const pin = pins.find(p => p.id === focusedPin)
                if (!pin) return
                const step = 1
                const moves = { ArrowUp: [0, -step], ArrowDown: [0, step], ArrowLeft: [-step, 0], ArrowRight: [step, 0] }
                const [dx, dy] = moves[e.key]
                const newX = Math.min(100, Math.max(0, Math.round((pin.x + dx) * 10) / 10))
                const newY = Math.min(100, Math.max(0, Math.round((pin.y + dy) * 10) / 10))
                const updated = { ...pin, x: newX, y: newY }
                await saveMapPin(updated)
                refresh()
              }
              if (session && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && !focusedPin && pins.length > 0) {
                setFocusedPin(pins[0].id)
                setTooltipPin(pins[0])
              }
            }}
            onTouchStart={handleMapTouchStart}
            onTouchEnd={cancelLongPress}
            onTouchMove={cancelLongPress}
          />
          {prevPins.map(pin => (
            <div
              key={'prev-' + pin.id}
              className="map-pin map-pin-ghost"
              style={pinStyle(pin, true)}
            >
              <div className="pin-dot" />
            </div>
          ))}
          {pins.map(pin => {
            const isDragging = dragging?.id === pin.id
            const showTooltip = tooltipPin?.id === pin.id && !isDragging && !mobilePinDetail
            return (
              <div
                key={pin.id}
                className={`map-pin ${isDragging ? 'dragging' : ''}`}
                style={pinStyle(pin, false)}
                tabIndex={-1}
                onMouseDown={(e) => handlePinPointerDown(e, pin)}
                onClick={(e) => handlePinTap(e, pin)}
                onFocus={() => { setFocusedPin(pin.id); setTooltipPin(pin) }}
                onTouchStart={(e) => {
                  if (longPressTimer.current) clearTimeout(longPressTimer.current)
                  handlePinPointerDown(e, pin)
                }}
              >
                <div className="pin-dot" />
                <span className="pin-label">{pin.label}</span>
                {showTooltip && (
                  <div className={'pin-tooltip' + (pin.y < 15 ? ' pin-tooltip-below' : '')} onClick={(e) => e.stopPropagation()}>
                    <strong>{pin.label}</strong>
                    {pin.description && <p className="pin-tooltip-desc">{pin.description}</p>}
                    {pin.addedBy && <p className="text-muted" style={{ fontSize: '0.7rem', margin: '2px 0' }}>by {pin.addedBy}</p>}
                    {canModifyPin(pin) && (
                      <div className="pin-tooltip-actions">
                        <button className="btn btn-sm" onClick={() => openEditPin(pin)}>✏️ Edit</button>
                        <button className="btn btn-sm btn-danger" onClick={() => setConfirmDeletePin(pin)}>🗑️</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
          {placingPos && showForm && (
            <div
              className="map-inline-form animate__animated animate__fadeIn"
              style={{
                left: `${placingPos.x}%`,
                top: `${placingPos.y}%`,
              }}
            >
              <div className="inline-form-header">
                <span className="inline-form-title">📍 New Pin</span>
                <button className="inline-form-close" onClick={() => { setShowForm(false); setPlacingPos(null) }}>&times;</button>
              </div>
              <input
                value={formData.label}
                onChange={e => setFormData({ ...formData, label: e.target.value })}
                placeholder="Pin name..."
                autoFocus
              />
              <textarea
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                placeholder="Description (optional)"
                rows={2}
              />
              <div className="inline-colors">
                {pinColors.map(c => (
                  <button
                    key={c}
                    className={`inline-swatch ${formData.color === c ? 'active' : ''}`}
                    style={{ background: c }}
                    onClick={() => setFormData({ ...formData, color: c })}
                  />
                ))}
              </div>
              <div className="inline-form-actions">
                <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                  {placingPos.x}%, {placingPos.y}%
                </span>
                <button className="btn btn-primary btn-sm" onClick={saveNewPin}>💾 Save</button>
              </div>
            </div>
          )}
        </div>

        {!showForm && !tooltipPin && (
          <div className="map-hint">
            {session ? 'Tap the map to add a pin — drag pins to move them' : 'Sign in to add pins'}
          </div>
        )}

        {sortedMaps.length > 1 && (
          <div className="timeline-bar">
            <div className="timeline-track">
              <input
                type="range"
                className="timeline-slider"
                min={0}
                max={sortedMaps.length - 1}
                value={timelineIndex}
                onChange={e => setTimelineIndex(parseInt(e.target.value))}
                step={1}
              />
              <div className="timeline-labels">
                {sortedMaps.map((m, i) => (
                  <button
                    key={m.id}
                    className={`timeline-label ${i === timelineIndex ? 'active' : ''}`}
                    onClick={() => setTimelineIndex(i)}
                    type="button"
                    title={`${m.name} (Year ${m.year ?? 0})`}
                  >
                    {m.name.substring(0, 3)}
                  </button>
                ))}
              </div>
              <div className="timeline-year-groups">
                {yearGroups.map(g => (
                  <span
                    key={g.year}
                    className="timeline-year-group"
                    style={{
                      left: `${(g.startIndex / sortedMaps.length) * 100}%`,
                      width: `${(g.count / sortedMaps.length) * 100}%`,
                    }}
                  >
                    Year {g.year}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        <button
          className="map-pin-list-toggle"
          onClick={() => setShowPinList(prev => !prev)}
          aria-label="Toggle pin list"
        >
          📍 {pins.length}
        </button>

        {showPinList && (
          <div className="map-pin-list-overlay" onClick={() => setShowPinList(false)}>
            <div className="map-pin-list" onClick={e => e.stopPropagation()}>
              <div className="map-pin-list-header">
                <span className="map-pin-list-title">📍 Pins ({pins.length})</span>
                <button className="map-pin-list-close" onClick={() => setShowPinList(false)}>&times;</button>
              </div>
              <div className="map-pin-list-body">
                {pins.length === 0 && (
                  <p className="text-muted" style={{ padding: 16, textAlign: 'center' }}>No pins on this map.</p>
                )}
                {pins.map(pin => (
                  <button
                    key={pin.id}
                    className="map-pin-list-item"
                    onClick={() => {
                      setTooltipPin(pin)
                      setMobilePinDetail(pin)
                      setShowPinList(false)
                    }}
                  >
                    <span className="map-pin-list-dot" style={{ background: pin.color }} />
                    <span className="map-pin-list-name">{pin.label}</span>
                    <span className="map-pin-list-coords">{pin.x}%, {pin.y}%</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {mobilePinDetail && (
          <div className="map-mobile-detail-overlay" onClick={() => setMobilePinDetail(null)}>
            <div className="map-mobile-detail" onClick={e => e.stopPropagation()}>
              <div className="map-mobile-detail-header">
                <span className="map-mobile-detail-dot" style={{ background: mobilePinDetail.color }} />
                <strong>{mobilePinDetail.label}</strong>
                <button className="map-mobile-detail-close" onClick={() => setMobilePinDetail(null)}>&times;</button>
              </div>
              {mobilePinDetail.description && (
                <p className="map-mobile-detail-desc">{mobilePinDetail.description}</p>
              )}
              <div className="map-mobile-detail-meta">
                {mobilePinDetail.x}%, {mobilePinDetail.y}% {mobilePinDetail.addedBy && <span>&middot; by {mobilePinDetail.addedBy}</span>}
              </div>
              {canModifyPin(mobilePinDetail) && (
                <div className="map-mobile-detail-actions">
                  <button className="btn btn-sm" onClick={() => {
                    openEditPin(mobilePinDetail)
                    setMobilePinDetail(null)
                  }}>✏️ Edit</button>
                  <button className="btn btn-sm btn-danger" onClick={() => {
                    setConfirmDeletePin(mobilePinDetail)
                    setMobilePinDetail(null)
                  }}>🗑️ Delete</button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showEditModal && editPin && (
        <Modal title={`✏️ Edit: ${editPin.label}`} onClose={() => { setShowEditModal(false); setEditPin(null) }}>
          <div className="mb-2">
            <label>Label</label>
            <input value={formData.label} onChange={e => setFormData({ ...formData, label: e.target.value })} />
          </div>
          <div className="mb-2">
            <label>Description</label>
            <textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} rows={3} />
          </div>
          <div className="mb-2">
            <label>Color</label>
            <div className="color-picker">
              {pinColors.map(c => (
                <button key={c} className={`color-swatch ${formData.color === c ? 'active' : ''}`} style={{ background: c }} onClick={() => setFormData({ ...formData, color: c })} />
              ))}
            </div>
          </div>
          <div className="flex-between">
            <button className="btn btn-danger btn-sm" onClick={() => setConfirmDeletePin(editPin)}>🗑️ Delete</button>
            <div className="flex gap-1">
              <button className="btn" onClick={() => { setShowEditModal(false); setEditPin(null) }}>Cancel</button>
              <button className="btn btn-primary" onClick={saveEditPin}>💾 Save</button>
            </div>
          </div>
        </Modal>
      )}

      {confirmDeletePin && (
        <Modal title="🗑️ Delete Pin" onClose={() => setConfirmDeletePin(null)}>
          <p className="mb-2">Remove <strong>{confirmDeletePin.label}</strong> from the map?</p>
          <div className="flex-between">
            <button className="btn" onClick={() => setConfirmDeletePin(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={() => removePin(confirmDeletePin.id)}>🗑️ Delete</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
