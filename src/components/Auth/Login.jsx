import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { login, getSession, checkAdminStatus, resetAdmin } from '../../data/auth'
import './Auth.css'

export default function Login() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [showRecovery, setShowRecovery] = useState(false)
  const [adminStatus, setAdminStatus] = useState(null)
  const [recoveryMsg, setRecoveryMsg] = useState('')
  const [checking, setChecking] = useState(false)
  const [adminUser, setAdminUser] = useState('')
  const [adminPass, setAdminPass] = useState('')

  useEffect(() => {
    const s = getSession()
    if (s) {
      navigate(s.role === 'dm' ? '/dm' : '/', { replace: true })
    }
  }, [navigate])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!username.trim() || !password.trim()) {
      setError('Please enter username and password')
      return
    }
    const result = await login(username.trim(), password)
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
          <span className="auth-footer-sep">·</span>
          <button className="auth-link-btn" onClick={() => setShowRecovery(!showRecovery)}>
            Trouble signing in?
          </button>
        </div>

        {showRecovery && (
          <div className="auth-recovery card mt-2">
            <h4 className="text-gold" style={{ fontSize: '0.9rem', marginBottom: 8 }}>Setup Admin Account</h4>
            <p className="text-muted" style={{ fontSize: '0.8rem', marginBottom: 8 }}>
              Create or reset the admin (DM) account. Uses the API key.
            </p>

            {recoveryMsg && (
              <p className={recoveryMsg.includes('ok') || recoveryMsg.includes('ready') ? 'auth-success' : 'auth-error'} style={{ padding: '4px 8px', fontSize: '0.85rem' }}>
                {recoveryMsg}
              </p>
            )}

            <div className="mb-1">
              <input
                value={adminUser}
                onChange={e => setAdminUser(e.target.value)}
                placeholder="Admin username"
                style={{ fontSize: '0.85rem' }}
              />
            </div>
            <div className="mb-1">
              <input
                type="password"
                value={adminPass}
                onChange={e => setAdminPass(e.target.value)}
                placeholder="Admin password"
                style={{ fontSize: '0.85rem' }}
              />
            </div>
            <button
              className="btn btn-sm btn-primary"
              disabled={!adminUser.trim() || !adminPass.trim() || checking}
              onClick={async () => {
                setChecking(true)
                setRecoveryMsg('')
                const result = await resetAdmin(adminUser.trim(), adminPass)
                setRecoveryMsg(result.ok ? 'Admin account ready! Try signing in.' : (result.error || 'Failed'))
                setChecking(false)
                if (result.ok) {
                  setAdminStatus({ adminExists: true })
                }
              }}
            >
              {checking ? 'Working...' : 'Create / Reset Admin'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
