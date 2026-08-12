import type { ReactNode } from 'react'
import type { User } from 'firebase/auth'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useUserRole } from '../hooks/useUserRole'
import type { UserRole } from '../services/firebase/auth'
import { FullScreenStatus } from '../components/FullScreenStatus'
import { Unauthorized } from '../pages/Unauthorized'

interface RoleResolverProps {
  /** Rendered only once the user is authenticated *and* has a role. */
  children: (ctx: { role: UserRole; user: User }) => ReactNode
}

/**
 * Shared gate for every route that requires a signed-in, role-provisioned
 * user: resolves Firebase Auth state, then the Firestore-backed role, and
 * renders the right thing for every step along the way —
 *
 *   auth loading      -> spinner
 *   no user            -> redirect to /login
 *   role loading        -> spinner
 *   role lookup failed  -> error screen
 *   role === null       -> "account not authorized" screen
 *   role resolved        -> `children({ role, user })`
 *
 * Centralized here so `/` (role-based landing) and the per-role protected
 * routes don't duplicate this state machine.
 */
export function RoleResolver({ children }: RoleResolverProps) {
  const { user, loading: authLoading } = useAuth()
  const { role, loading: roleLoading, error } = useUserRole(user)

  if (authLoading) {
    return <FullScreenStatus variant="loading" title="Cargando…" />
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (roleLoading) {
    return <FullScreenStatus variant="loading" title="Cargando…" />
  }

  if (error) {
    return (
      <FullScreenStatus
        variant="error"
        title="No se pudo verificar tu cuenta"
        description="Ocurrió un problema al cargar tu cuenta. Intenta de nuevo."
      />
    )
  }

  if (role === null) {
    return <Unauthorized />
  }

  return <>{children({ role, user })}</>
}
