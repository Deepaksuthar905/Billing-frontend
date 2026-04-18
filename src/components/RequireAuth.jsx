import { Navigate, useLocation } from 'react-router-dom'
import { getAuthToken } from '../lib/authToken'

export default function RequireAuth({ children }) {
  const location = useLocation()
  if (!getAuthToken()) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return children
}
