import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { getNotifications, markAllNotificationsRead, markNotificationRead, getPlayer, getNPC } from '../../data/store'

const TYPE_ICONS = {
  comment: '💬',
  questionnaire: '📝',
  downtime: '📜',
}

function formatTime(ts) {
  const diff = Date.now() - ts
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago'
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago'
  if (diff < 604800000) return Math.floor(diff / 86400000) + 'd ago'
  return new Date(ts).toLocaleDateString()
}

export default function NotificationsPanel({ playerId, onClose }) {
  const [open, setOpen] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [unread, setUnread] = useState([])
  const [all, setAll] = useState([])
  const panelRef = useRef(null)
  const badgeRef = useRef(null)

  const refresh = () => {
    setUnread(getNotifications(playerId, true))
    setAll(getNotifications(playerId, false))
  }

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 15000)
    return () => clearInterval(interval)
  }, [playerId])

  useEffect(() => {
    const handleClick = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target) &&
          badgeRef.current && !badgeRef.current.contains(e.target)) {
        setOpen(false)
        setShowHistory(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead(playerId)
    refresh()
  }

  const handleClickNotif = async (n) => {
    if (!n.read) {
      await markNotificationRead(n.id)
      refresh()
    }
  }

  const count = unread.length

  const displayed = showHistory ? all : unread

  return (
    <>
      <div ref={badgeRef} style={{ position: 'relative', display: 'inline-block' }}>
        <button
          onClick={() => { setOpen(!open); setShowHistory(false) }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: count > 0 ? 'rgba(201,148,42,0.15)' : 'rgba(255,255,255,0.05)',
            border: count > 0 ? '1px solid rgba(201,148,42,0.4)' : '1px solid rgba(255,255,255,0.1)',
            borderRadius: 4, padding: '5px 14px', cursor: 'pointer',
            fontWeight: 700, color: count > 0 ? '#c9a84c' : 'var(--text-muted)',
            fontSize: '0.78rem', fontFamily: 'inherit',
            transition: 'all 0.15s',
          }}
        >
          <span>🔔</span>
          {count > 0 ? `${count} Pending` : 'Notifications'}
        </button>
      </div>

      {open && (
        <div
          ref={panelRef}
          style={{
            position: 'absolute', top: '100%', right: 0, zIndex: 100,
            minWidth: 360, maxWidth: '90vw', maxHeight: 420, overflow: 'auto',
            background: '#1a1510', border: '1px solid #3a2a1a',
            borderRadius: 6, boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            marginTop: 8,
          }}
        >
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '10px 14px', borderBottom: '1px solid #2a1e12',
          }}>
            <span style={{ fontWeight: 700, color: '#c9a84c', fontSize: '0.82rem' }}>
              {showHistory ? '📋 Notification History' : `🔔 Notifications (${count})`}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              {count > 0 && !showHistory && (
                <button
                  onClick={handleMarkAllRead}
                  style={{
                    background: 'none', border: '1px solid rgba(201,148,42,0.3)',
                    color: '#c9a84c', padding: '3px 10px', borderRadius: 3,
                    cursor: 'pointer', fontSize: '0.68rem', fontFamily: 'inherit',
                  }}
                >
                  Mark All Read
                </button>
              )}
              <button
                onClick={() => setShowHistory(!showHistory)}
                style={{
                  background: 'none', border: '1px solid rgba(255,255,255,0.15)',
                  color: 'var(--text-muted)', padding: '3px 10px', borderRadius: 3,
                  cursor: 'pointer', fontSize: '0.68rem', fontFamily: 'inherit',
                }}
              >
                {showHistory ? '◀ Unread' : '📋 All'}
              </button>
            </div>
          </div>

          {displayed.length === 0 ? (
            <div style={{ padding: '24px 14px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              {showHistory ? 'No notification history yet.' : 'No new notifications.'}
            </div>
          ) : (
            displayed.map(n => (
              <Link
                key={n.id}
                to={n.link}
                onClick={() => handleClickNotif(n)}
                style={{
                  display: 'flex', gap: 10, padding: '10px 14px',
                  borderBottom: '1px solid #2a1e12', textDecoration: 'none',
                  background: n.read ? 'transparent' : 'rgba(201,148,42,0.04)',
                  transition: 'background 0.1s',
                  cursor: 'pointer', color: 'inherit',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                onMouseLeave={e => e.currentTarget.style.background = n.read ? 'transparent' : 'rgba(201,148,42,0.04)'}
              >
                <span style={{ fontSize: '1rem', flexShrink: 0, marginTop: 1 }}>
                  {TYPE_ICONS[n.type] || '🔔'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontWeight: n.read ? 400 : 600, color: n.read ? 'var(--text-muted)' : '#e0d5c1',
                    fontSize: '0.82rem', lineHeight: 1.3, marginBottom: 3,
                  }}>
                    {n.title}
                  </div>
                  {n.message && (
                    <div style={{
                      fontSize: '0.75rem', color: 'var(--text-muted)',
                      lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {n.message}
                    </div>
                  )}
                  <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>
                    {formatTime(n.createdAt)}
                  </div>
                </div>
                {!n.read && (
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: '#c9a84c', flexShrink: 0, marginTop: 6,
                  }} />
                )}
              </Link>
            ))
          )}

          <div style={{
            padding: '8px 14px', borderTop: '1px solid #2a1e12',
            textAlign: 'center', fontSize: '0.7rem', color: 'rgba(255,255,255,0.25)',
          }}>
            {all.length > 0 ? `${all.length} total · ${all.filter(n => n.read).length} read` : ''}
          </div>
        </div>
      )}
    </>
  )
}
