import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { register, getSession } from '../../data/auth'
import './Auth.css'

export default function Register() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [proposedName, setProposedName] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    const s = getSession()
    if (s) {
      navigate(s.role === 'dm' ? '/dm' : '/', { replace: true })
    }
  }, [navigate])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    const result = await register(username.trim(), password, proposedName.trim())
    if (result.ok) {
      setSuccess('✅ Registration submitted for DM approval! You will be able to sign in once approved.')
    } else {
      setError(result.error)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card card gold-border animate__animated animate__fadeIn">
        <div className="auth-header">
          <div className="auth-icon">📜</div>
          <h2 className="text-gold">Join the Adventure</h2>
          <p className="text-muted mt-1">Submit a character request for DM approval</p>
        </div>

        {error && <div className="auth-error" role="alert">{error}</div>}
        {success && <div className="auth-success" role="status">{success}</div>}

        <form onSubmit={handleSubmit}>
          <div className="mb-2">
            <label>Username</label>
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Choose a username"
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
              placeholder="Choose a password (min 4 chars)"
              autoComplete="new-password"
            />
          </div>
          <div className="mb-2">
            <label>Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Confirm your password"
              autoComplete="new-password"
            />
          </div>

          <div className="mb-2">
            <label>Proposed Character Name *</label>
            <input
              value={proposedName}
              onChange={e => setProposedName(e.target.value)}
              placeholder="What do you want your character to be called?"
              required
            />
          </div>

          <button type="submit" className="btn btn-primary auth-submit">
            📜 Submit for Approval
          </button>
        </form>

        <div className="auth-divider">or</div>

        <div className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </div>
      </div>
    </div>
  )
}
