import { Navigate, useLocation } from 'react-router-dom'

import { useAuth } from '../hooks/useAuth'

/** Gate for every /app/* route. No token means straight back to /login. */
export function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth()
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return children
}

/** Keeps signed-in users out of /login and /register. */
export function PublicOnlyRoute({ children }) {
  const { isAuthenticated } = useAuth()
  if (isAuthenticated) return <Navigate to="/app" replace />
  return children
}
