import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import type { UserRole } from '../services/firebase/auth'
import { RoleResolver } from './RoleResolver'

interface ProtectedRouteProps {
  allowedRole: UserRole
  children: ReactNode
}

const PANEL_PATH: Record<UserRole, string> = {
  cafeteria: '/cafeteria',
  production: '/production',
}

/**
 * Guards a role-specific panel route. Requires auth + a provisioned role
 * (see `RoleResolver`) and additionally bounces a mismatched role back to
 * *their own* panel — a cafeteria account hitting `/production` (or vice
 * versa) is redirected, not shown an error.
 */
export function ProtectedRoute({ allowedRole, children }: ProtectedRouteProps) {
  return (
    <RoleResolver>
      {({ role }) =>
        role === allowedRole ? children : <Navigate to={PANEL_PATH[role]} replace />
      }
    </RoleResolver>
  )
}
