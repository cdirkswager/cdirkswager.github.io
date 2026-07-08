import { Navigate, Link } from 'react-router-dom'
import { getSession } from '../../data/auth'

export default function VttGuard({ children }) {
  const session = getSession()
  if (!session) return <Navigate to="/login" replace />
  // DMs always allowed — no character required
  if (session.role === 'dm') return children
  // Players must have a claimed character
  if (!session.playerId) {
    return (
      <div className="page container text-center">
        <h2 className="text-gold mb-2">No Character</h2>
        <p className="text-muted mb-3">You haven&apos;t claimed a character yet. Ask your DM to assign one.</p>
        <Link to="/" className="btn btn-primary">Return Home</Link>
      </div>
    )
  }
  return children
}
