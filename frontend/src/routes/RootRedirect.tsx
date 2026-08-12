import { Navigate } from 'react-router-dom'
import type { UserRole } from '../services/firebase/auth'
import { RoleResolver } from './RoleResolver'

const PANEL_PATH: Record<UserRole, string> = {
  cafeteria: '/cafeteria',
  production: '/production',
}

/**
 * `/` has no UI of its own — it's the landing spot after login (password
 * or email-link) that sends an authenticated, role-provisioned user to
 * their panel. `RoleResolver` handles every other state (loading,
 * unauthenticated, unauthorized).
 */
export function RootRedirect() {
  return (
    <RoleResolver>{({ role }) => <Navigate to={PANEL_PATH[role]} replace />}</RoleResolver>
  )
}
