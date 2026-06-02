import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { register, login, getSession, getAllUsers, saveAccessRequest, isPlayerClaimed, getClaimedPlayerIds } from '../../data/auth'
import { getPlayers } from '../../data/store'
import './Auth.css'

export default function Register() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [playerId, setPlayerId] = useState('')
  const [requestMessage, setRequestMessage] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [players, setPlayers] = useState([])

  const claimedIds = getClaimedPlayerIds()
  const availablePlayers = players.filter(p => !claimedIds[p.id])

  useEffect(() => {
    const s = getSession()
    if (s) {
      navigate(s.role === 'dm' ? '/dm' : '/', { replace: true })
    }
    setPlayers(getPlayers())
  }, [navigate])

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    const result = register(username.trim(), password, playerId || null)
    if (result.ok) {
      login(username.trim(), password)
      if (playerId) {
        saveAccessRequest({ username: username.trim(), playerId, message: requestMessage.trim() || '' })
      }
      setSuccess('✅ Account created! Welcome, adventurer.')
      setTimeout(() => navigate('/', { replace: true }), 1000)
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
          <p className="text-muted mt-1">Create a player account to join the campaign</p>
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
            <label>Choose Your Character *</label>
            <select
              value={playerId}
              onChange={e => setPlayerId(e.target.value)}
              required
            >
              <option value="">— Select a character —</option>
              {availablePlayers.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {availablePlayers.length === 0 && (
              <p className="text-muted mt-1" style={{ fontSize: '0.85rem' }}>
                All characters have been claimed. Ask the DM to create more.
              </p>
            )}
            {players.length > 0 && availablePlayers.length < players.length && (
              <p className="text-muted mt-1" style={{ fontSize: '0.85rem' }}>
                {players.length - availablePlayers.length} character{players.length - availablePlayers.length !== 1 ? 's' : ''} already claimed
              </p>
            )}
          </div>
          {playerId && (
            <div className="mb-2">
              <label>Message to the DM</label>
              <textarea
                value={requestMessage}
                onChange={e => setRequestMessage(e.target.value)}
                placeholder="Tell the DM why you chose this character..."
                rows={3}
              />
            </div>
          )}

          <button type="submit" className="btn btn-primary auth-submit" disabled={availablePlayers.length === 0}>
            📜 Join the Party
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
