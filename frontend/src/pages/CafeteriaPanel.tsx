import { useNavigate } from 'react-router-dom'
import { signOutUser } from '../services/firebase/auth'
import { FullScreenStatus } from '../components/FullScreenStatus'

/**
 * Placeholder for the Cafeteria role's home screen. The real
 * catalog/sales/waste UI lands in later phases — this only proves the
 * role-gated route works end to end.
 */
export function CafeteriaPanel() {
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOutUser()
    navigate('/login', { replace: true })
  }

  return (
    <FullScreenStatus
      variant="info"
      title="Panel Cafetería"
      description="Próximamente."
      action={
        <button type="button" className="btn btn-secondary" onClick={handleSignOut}>
          Cerrar sesión
        </button>
      }
    />
  )
}
