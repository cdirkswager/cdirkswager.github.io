import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { getSession, logout } from '../../data/auth'
import RateLimitBanner from '../common/RateLimitBanner'
import { onStatusChange } from '../../data/sync'
import './Layout.css'

export default function Layout({ children }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [session, setSession] = useState(getSession())
  const [pendingChanges, setPendingChanges] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    const unsub = onStatusChange(s => setPendingChanges(s.localChanges))
    return unsub
  }, [])

  useEffect(() => {
    setSession(getSession())
  }, [location])

  const handleLogout = () => {
    logout()
    setSession(null)
    setMenuOpen(false)
    navigate('/')
  }

  const navLinks = [
    { path: '/', label: 'Home', icon: '🏰' },
    { path: '/map', label: 'Map', icon: '🗺️' },
  ]
  if (session?.role === 'dm') {
    navLinks.push({ path: '/dm', label: 'DM Tools', icon: '⚔️' })
  }
  if (session?.role === 'player' && session?.playerId) {
    navLinks.push({ path: '/profile', label: 'My Profile', icon: '🎭' })
  }

  return (
    <div className="layout">
      <nav className="navbar">
        <div className="container nav-inner">
          <Link to="/" className="nav-brand" onClick={() => setMenuOpen(false)}>
            <span className="nav-icon">🐉</span>
            <span className="nav-title">The Hunt</span>
          </Link>

          <button
            className={`menu-toggle ${menuOpen ? 'open' : ''}`}
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle navigation menu"
            aria-expanded={menuOpen}
          >
            <span className="menu-bar" />
            <span className="menu-bar" />
            <span className="menu-bar" />
          </button>

          <div className={`nav-links ${menuOpen ? 'open' : ''}`}>
            {navLinks.map(link => (
              <div key={link.path} className="nav-link-wrapper">
                <Link
                  to={link.path}
                  className={`nav-link ${location.pathname === link.path ? 'active' : ''}`}
                  onClick={() => setMenuOpen(false)}
                >
                  <span className="nav-link-icon">{link.icon}</span>
                  {link.label}
                </Link>
                {link.path === '/dm' && pendingChanges && (
                  <span className="nav-pending-badge" title="Unsaved changes — push to Worker to sync">📝</span>
                )}
              </div>
            ))}

            {session ? (
              <div className="nav-session">
                <span className={`session-info ${session.role === 'dm' ? 'session-dm' : 'session-player'}`}>
                  {session.role === 'dm' ? '⚔️' : '🎭'} {session.username}
                </span>
                <button className="btn btn-sm nav-logout" onClick={handleLogout} aria-label="Log out">
                  🚪
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                className="nav-link"
                onClick={() => setMenuOpen(false)}
              >
                <span className="nav-link-icon">🔐</span>
                Sign In
              </Link>
            )}
          </div>
        </div>
      </nav>

      {menuOpen && (
        <div className="nav-overlay" onClick={() => setMenuOpen(false)} />
      )}

      <RateLimitBanner />

      <main className="main-content">
        {children}
      </main>

      <footer className="footer">
        <div className="container">
          <p className="footer-text">
            ⚔️ The Hunt — A Medieval Fantasy Campaign ⚔️
          </p>
        </div>
      </footer>
    </div>
  )
}
