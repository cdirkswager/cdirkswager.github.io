import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  initCalendar, getCalendarData,
  getDayEvents, advanceCalendarDay, setCalendarState,
  getCalendarComments, addCalendarComment, deleteCalendarComment,
} from '../../data/store'
import { getSession } from '../../data/auth'
import Modal from '../common/Modal'
import './CalendarPage.css'

const MONTH_NAMES = ['Hammer', 'Alturiak', 'Ches', 'Tarsakh', 'Mirtul', 'Kythorn', 'Flamerule', 'Eleasis', 'Eleint', 'Marpenoth', 'Uktar', 'Nightal']
const DAY_NAMES = ['Day of the Sun', 'Day of the Moon', 'Day of Mysteries', 'Day of Justice', 'Day of the Wild', 'Day of the Book', 'Day of Grain', 'Day of Strife', 'Day of the Dead', 'Day of Love']
const ROWS = 6
const COLS = 5

function dayName(day) {
  return DAY_NAMES[(day - 1) % 10]
}

export default function CalendarPage() {
  const [calState, setCalState] = useState(null)
  const [allEvents, setAllEvents] = useState([])
  const [viewMonth, setViewMonth] = useState(null)
  const [viewYear, setViewYear] = useState(null)
  const [selectedDay, setSelectedDay] = useState(null)
  const [dayComments, setDayComments] = useState([])
  const [commentText, setCommentText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(null)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [pickerMonth, setPickerMonth] = useState(0)
  const [pickerDay, setPickerDay] = useState(1)
  const [pickerYear, setPickerYear] = useState(3102)
  const session = getSession()
  const isDm = session?.role === 'dm'

  const refresh = useCallback(() => {
    const cal = getCalendarData()
    setCalState(cal.state)
    setAllEvents(cal.events || [])
  }, [])

  useEffect(() => {
    initCalendar()
    refresh()
  }, [refresh])

  useEffect(() => {
    if (calState && viewMonth === null) {
      setViewMonth(calState.month)
    }
  }, [calState, viewMonth])

  useEffect(() => {
    if (calState && viewYear === null) {
      setViewYear(calState.year)
    }
  }, [calState, viewYear])

  const monthEvents = useMemo(() => {
    if (viewMonth === null || viewYear === null) return []
    return allEvents.filter(e => {
      if (e.month !== viewMonth) return false
      if (e.year !== undefined) return e.year === viewYear
      return true
    })
  }, [allEvents, viewMonth, viewYear])

  const eventsForDay = (day) => {
    return monthEvents.filter(e => e.day === day)
  }

  const commentCount = (day) => {
    if (viewMonth === null || viewYear === null) return 0
    return getCalendarComments(viewMonth, day, viewYear).length
  }

  const handlePrevDay = async () => {
    const state = await advanceCalendarDay(-1)
    setCalState(state)
    setViewMonth(state.month)
    setViewYear(state.year)
  }

  const handleNextDay = async () => {
    const state = await advanceCalendarDay(1)
    setCalState(state)
    setViewMonth(state.month)
    setViewYear(state.year)
  }

  const handleToday = () => {
    setViewMonth(calState.month)
    setViewYear(calState.year)
  }

  const openDay = (day) => {
    setSelectedDay(day)
    if (viewMonth !== null && viewYear !== null) {
      setDayComments(getCalendarComments(viewMonth, day, viewYear))
    }
    setCommentText('')
    setConfirmingDelete(null)
  }

  const handleAddComment = async (e) => {
    e.preventDefault()
    const words = commentText.trim().split(/\s+/)
    const limited = words.slice(0, 25).join(' ')
    if (!limited || !session || submitting || viewMonth === null || viewYear === null || selectedDay == null) return
    setSubmitting(true)
    await addCalendarComment(viewMonth, selectedDay, session.username, limited, viewYear)
    setCommentText('')
    setDayComments(getCalendarComments(viewMonth, selectedDay, viewYear))
    setSubmitting(false)
  }

  const handleDeleteComment = async (commentId) => {
    if (viewMonth === null || viewYear === null || selectedDay == null) return
    await deleteCalendarComment(commentId, viewMonth, selectedDay, viewYear)
    setConfirmingDelete(null)
    setDayComments(getCalendarComments(viewMonth, selectedDay, viewYear))
  }

  const handleDmSetDate = async () => {
    await setCalendarState({ year: pickerYear, month: pickerMonth, day: pickerDay })
    setShowDatePicker(false)
    refresh()
    setViewMonth(pickerMonth)
    setViewYear(pickerYear)
  }

  const openDatePicker = () => {
    if (!calState) return
    setPickerMonth(calState.month)
    setPickerDay(calState.day)
    setPickerYear(calState.year)
    setShowDatePicker(true)
  }

  const isGameDate = (day) => {
    return calState && viewYear === calState.year && viewMonth === calState.month && calState.day === day
  }

  if (!calState || viewMonth === null) {
    return <div className="page"><div className="container"><p className="text-muted">Loading calendar...</p></div></div>
  }

  const grid = []
  let dayNum = 1
  for (let r = 0; r < ROWS; r++) {
    const row = []
    for (let c = 0; c < COLS; c++) {
      if (dayNum <= 30) {
        row.push(dayNum)
        dayNum++
      }
    }
    grid.push(row)
  }

  return (
    <div className="page">
      <div className="container calendar-page">
        <div className="calendar-header">
          <div className="calendar-header-left">
            <select
              className="map-selector"
              value={viewMonth}
              onChange={e => setViewMonth(parseInt(e.target.value))}
            >
              {MONTH_NAMES.map((name, i) => (
                <option key={i} value={i}>{name}</option>
              ))}
            </select>
            <select className="map-selector" value={viewYear} onChange={e => setViewYear(parseInt(e.target.value))}>
              {[3101,3102,3103,3104,3105,3106,3107].map(y => (
                <option key={y} value={y}>Year {y}</option>
              ))}
            </select>
          </div>
          <div className="calendar-header-center">
            {session ? (
              <div className="calendar-nav-buttons">
                <button className="btn btn-sm" onClick={handlePrevDay} title="Previous day">◀ Prev</button>
                <button className="btn btn-sm" onClick={handleToday} title="Go to current game date">Today</button>
                <span className="calendar-current-date">
                  {MONTH_NAMES[calState.month]} {calState.day}, Year {calState.year}
                  <span className="calendar-today-name"> &middot; {dayName(calState.day)}</span>
                </span>
                <button className="btn btn-sm" onClick={handleNextDay} title="Next day">Next ▶</button>
              </div>
            ) : (
              <span className="calendar-current-date">
                {MONTH_NAMES[calState.month]} {calState.day}, Year {calState.year}
                <span className="calendar-today-name"> &middot; {dayName(calState.day)}</span>
              </span>
            )}
          </div>
          <div className="calendar-header-right">
            {isDm && (
              <button className="btn btn-sm" onClick={openDatePicker}>📅 Set Date</button>
            )}
          </div>
        </div>

        <div className="calendar-grid">
          {grid.map((row, ri) => (
            <div key={ri} className="calendar-row">
              {row.map(day => {
                const events = eventsForDay(day)
                const cc = commentCount(day)
                const today = isGameDate(day)
                return (
                  <button
                    key={day}
                    className={`calendar-cell ${today ? 'calendar-cell-today' : ''} ${events.length > 0 ? 'calendar-cell-has-events' : ''}`}
                    onClick={() => openDay(day)}
                  >
                    <div className="calendar-cell-header">
                      <span className="calendar-cell-day">{day}</span>
                      {cc > 0 && <span className="calendar-cell-cc">{cc}💬</span>}
                    </div>
                    <div className="calendar-cell-dayname">{dayName(day)}</div>
                    {events.length > 0 && (
                      <div className="calendar-cell-events">
                        {events.slice(0, 2).map((evt, i) => (
                          <div key={i} className="calendar-cell-event">{evt.title}</div>
                        ))}
                        {events.length > 2 && (
                          <div className="calendar-cell-more">+{events.length - 2} more</div>
                        )}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        {viewMonth === calState.month && (
          <div className="calendar-game-date-note">
            📍 Current game date: {MONTH_NAMES[calState.month]} {calState.day}, Year {calState.year}
          </div>
        )}

        <div className="calendar-day-legend">
          {DAY_NAMES.map((name, i) => (
            <span key={i} className="calendar-legend-item">
              <span className="calendar-legend-swatch" style={{ background: `hsl(${i * 36}, 60%, 60%)` }} />
              {name}
            </span>
          ))}
        </div>

        {selectedDay != null && (
          <Modal
            title={`${MONTH_NAMES[viewMonth]} ${selectedDay}, Year ${viewYear} — ${dayName(selectedDay)}`}
            onClose={() => { setSelectedDay(null); setDayComments([]) }}
          >
            {(() => {
              const dayEvts = eventsForDay(selectedDay)
              return (
                <div className="calendar-day-detail">
                  {dayEvts.length === 0 ? (
                    <p className="text-muted">No events on this day.</p>
                  ) : (
                    <div className="calendar-day-events">
                      {dayEvts.map((evt, i) => (
                        <div key={i} className="calendar-day-event">
                          <strong className="calendar-day-event-title">{evt.title}</strong>
                          {evt.dayName && (
                            <span className="calendar-day-event-type">
                              &middot; {evt.dayName}
                            </span>
                          )}
                          {evt.description && (
                            <p className="calendar-day-event-desc">{evt.description}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="calendar-day-comments">
                    <h4 className="widget-title">💬 Comments ({dayComments.length})</h4>
                    {dayComments.length === 0 && (
                      <p className="text-muted" style={{ fontSize: '0.9rem' }}>No comments yet.</p>
                    )}
                    <div className="guestbook-list">
                      {dayComments.map(c => (
                        <div key={c.id} className="guestbook-entry">
                          <div className="guestbook-entry-header">
                            <span className="guestbook-author">{c.author}</span>
                            <span className="guestbook-date">{new Date(c.timestamp).toLocaleDateString()}</span>
                          </div>
                          <p className="guestbook-text">{c.text}</p>
                          {(isDm || session?.username === c.author) && (
                            confirmingDelete === c.id ? (
                              <div className="guestbook-confirm">
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Delete?</span>
                                <button className="btn btn-sm btn-danger" onClick={() => handleDeleteComment(c.id)}>Yes</button>
                                <button className="btn btn-sm" onClick={() => setConfirmingDelete(null)}>No</button>
                              </div>
                            ) : (
                              <button className="btn btn-sm guestbook-delete" onClick={() => setConfirmingDelete(c.id)}>🗑️</button>
                            )
                          )}
                        </div>
                      ))}
                    </div>

                    {session ? (
                      <form className="guestbook-form" onSubmit={handleAddComment}>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <textarea
                            value={commentText}
                            onChange={e => setCommentText(e.target.value)}
                            placeholder="Leave a comment (25 word limit)..."
                            rows={2}
                            required
                          />
                          <span style={{
                            fontSize: '0.7rem',
                            color: commentText.trim().split(/\s+/).filter(Boolean).length > 25 ? 'var(--accent-fire)' : 'var(--text-muted)',
                            textAlign: 'right',
                          }}>
                            {commentText.trim().split(/\s+/).filter(Boolean).length}/25
                          </span>
                        </div>
                        <button type="submit" className="btn btn-primary btn-sm" disabled={submitting}>
                          {submitting ? '...' : 'Comment'}
                        </button>
                      </form>
                    ) : (
                      <p className="text-muted" style={{ fontSize: '0.9rem', marginTop: 8 }}>
                        <a href="/login">Sign in</a> to leave a comment.
                      </p>
                    )}
                  </div>
                </div>
              )
            })()}
          </Modal>
        )}

        {showDatePicker && (
          <Modal title="📅 Set Current Date" onClose={() => setShowDatePicker(false)}>
            <div className="mb-2">
              <label>Month</label>
              <select value={pickerMonth} onChange={e => setPickerMonth(parseInt(e.target.value))}>
                {MONTH_NAMES.map((name, i) => (
                  <option key={i} value={i}>{name}</option>
                ))}
              </select>
            </div>
            <div className="mb-2">
              <label>Day</label>
              <input type="number" min={1} max={30} value={pickerDay} onChange={e => setPickerDay(Math.min(30, Math.max(1, parseInt(e.target.value) || 1)))} />
            </div>
            <div className="mb-2">
              <label>Year</label>
              <input type="number" value={pickerYear} onChange={e => setPickerYear(parseInt(e.target.value) || 3102)} />
            </div>
            <div className="text-center">
              <button className="btn btn-primary" onClick={handleDmSetDate}>Set Date</button>
            </div>
          </Modal>
        )}
      </div>
    </div>
  )
}
