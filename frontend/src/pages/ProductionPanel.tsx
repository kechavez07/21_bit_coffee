import { useNavigate } from 'react-router-dom'
import { signOutUser } from '../services/firebase/auth'
import { FullScreenStatus } from '../components/FullScreenStatus'

/**
 * Placeholder for the Production role's home screen. The real
 * production/restock UI lands in later phases — this only proves the
 * role-gated route works end to end.
 */
export function ProductionPanel() {
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOutUser()
    navigate('/login', { replace: true })
  }

  return (
    <FullScreenStatus
      variant="info"
      title="Panel Producción"
      description="Próximamente."
      action={
        <button type="button" className="btn btn-secondary" onClick={handleSignOut}>
          Cerrar sesión
        </button>
      }
    />
  )
}
