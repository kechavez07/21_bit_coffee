import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { signOutUser } from '../../services/firebase/auth'
import { NotificationsToggle } from '../../components/NotificationsToggle'
import { ThemeToggle } from '../../components/ThemeToggle'
import { BrandMark } from '../../components/BrandMark'
import '../../styles/forms.css'
import '../../styles/catalog.css'
import '../../styles/restockRequests.css'

/**
 * Shell for every Pastelería screen: top bar (brand + sign-out) and a tab
 * nav for the panel's subroutes, rendering the active one via `<Outlet/>`.
 * Same shape as `CafeteriaLayout` (Phase 3) — replaces the Phase 1
 * placeholder (`pages/ProductionPanel.tsx`, now removed) now that the
 * restock-request flow gives pastelería real screens. Phase 6 added
 * `NotificationsToggle` next to the sign-out button.
 */
export function ProductionLayout() {
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOutUser()
    navigate('/login', { replace: true })
  }

  return (
    <div className="panel-shell">
      <header className="panel-topbar">
        <div className="panel-topbar-brand">
          <BrandMark />
          <span className="eyebrow panel-topbar-role">Producción</span>
        </div>
        <div className="panel-topbar-actions">
          <ThemeToggle />
          <NotificationsToggle />
          <button type="button" className="btn btn-secondary" onClick={handleSignOut}>
            Cerrar sesión
          </button>
        </div>
      </header>

      <nav className="tabs panel-nav" role="tablist" aria-label="Secciones de pastelería">
        <NavLink
          to="/production"
          end
          role="tab"
          className={({ isActive }) => `tab${isActive ? ' tab-active' : ''}`}
        >
          Dashboard
        </NavLink>
        <NavLink
          to="/production/solicitudes"
          role="tab"
          className={({ isActive }) => `tab${isActive ? ' tab-active' : ''}`}
        >
          Solicitudes
        </NavLink>
        <NavLink
          to="/production/cola"
          role="tab"
          className={({ isActive }) => `tab${isActive ? ' tab-active' : ''}`}
        >
          Cola
        </NavLink>
      </nav>

      <main className="panel-content">
        <Outlet />
      </main>
    </div>
  )
}
