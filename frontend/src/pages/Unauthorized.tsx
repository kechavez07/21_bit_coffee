import { useNavigate } from 'react-router-dom'
import { signOutUser } from '../services/firebase/auth'
import { FullScreenStatus } from '../components/FullScreenStatus'

/**
 * Shown when `useUserRole` resolves to `null`: the user authenticated
 * successfully but has no `users/{uid}` doc (no role provisioned). This is
 * a legitimate, expected state — not an error — per the "no self-service
 * sign-up" model documented in `services/firebase/auth.ts`.
 */
export function Unauthorized() {
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOutUser()
    navigate('/login', { replace: true })
  }

  return (
    <FullScreenStatus
      variant="info"
      title="Cuenta no autorizada"
      description="Tu cuenta inició sesión correctamente, pero todavía no tiene un rol asignado. Contacta al administrador para que active tu acceso."
      action={
        <button type="button" className="btn btn-secondary" onClick={handleSignOut}>
          Cerrar sesión
        </button>
      }
    />
  )
}
