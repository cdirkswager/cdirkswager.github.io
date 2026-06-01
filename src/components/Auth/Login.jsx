import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { login, getSession, getAllUsers } from '../../data/auth'
import './Auth.css'

export default function Login() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const noUsers = getAllUsers().length === 0

  useEffect(() => {
    const s = getSession()
    if (s) {
      navigate(s.role === 'dm' ? '/dm' : '/', { replace: true })
    }
  }, [navigate])

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')
    if (!username.trim() || !password.trim()) {
      setError('Please enter username and password')
      return
    }
    const result = login(username.trim(), password)
    if (result.ok) {
      navigate(result.session.role === 'dm' ? '/dm' : '/', { replace: true })
    } else {
      setError(result.error)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card card gold-border animate__animated animate__fadeIn">
        <div className="auth-header">
          <div className="auth-icon">🔐</div>
          <h2 className="text-gold">Welcome Back</h2>
          <p className="text-muted mt-1">Sign in to the campaign hub</p>
        </div>

        {noUsers && (
          <div className="dm-setup-hint">
            ⚔️ No accounts exist yet. The first person to register becomes the <strong>Dungeon Master</strong>.
          </div>
        )}

        {error && <div className="auth-error" role="alert">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="mb-2">
            <label>Username</label>
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Enter your username"
              autoComplete="username"
              autoFocus
            />
          </div>
          <div className="mb-2">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
            />
          </div>
          <button type="submit" className="btn btn-primary auth-submit">
            🔑 Sign In
          </button>
        </form>

        <div className="auth-divider">or</div>

        <div className="auth-footer">
          <Link to="/register">Create a new account</Link>
        </div>
      </div>
    </div>
  )
}
