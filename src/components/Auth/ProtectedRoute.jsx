import { Navigate } from 'react-router-dom'
import { isDM, isLoggedIn, getSession } from '../../data/auth'

export function RequireDM({ children }) {
  if (!isDM()) {
    return <Navigate to={isLoggedIn() ? '/' : '/login'} replace />
  }
  return children
}

export function RequirePlayer({ children }) {
  if (!isLoggedIn()) {
    return <Navigate to="/login" replace />
  }
  return children
}

export function RedirectIfLoggedIn({ children }) {
  const session = getSession()
  if (session) {
    return <Navigate to={session.role === 'dm' ? '/dm' : '/'} replace />
  }
  return children
}
