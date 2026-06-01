import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import './Layout.css'

export default function Layout({ children }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  const isDM = location.pathname.startsWith('/dm')

  const navLinks = [
    { path: '/', label: 'Home', icon: '🏰' },
    { path: '/map', label: 'Map', icon: '🗺️' },
    { path: '/dm', label: 'DM Tools', icon: '⚔️' },
  ]

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
              <Link
                key={link.path}
                to={link.path}
                className={`nav-link ${location.pathname === link.path ? 'active' : ''}`}
                onClick={() => setMenuOpen(false)}
              >
                <span className="nav-link-icon">{link.icon}</span>
                {link.label}
              </Link>
            ))}
            {isDM && (
              <span className="dm-badge">DM</span>
            )}
          </div>
        </div>
      </nav>

      {menuOpen && (
        <div className="nav-overlay" onClick={() => setMenuOpen(false)} />
      )}

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
