import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { signOutUser } from '../../services/firebase/auth'
import { NotificationsToggle } from '../../components/NotificationsToggle'
import { ThemeToggle } from '../../components/ThemeToggle'
import { BrandMark } from '../../components/BrandMark'
import '../../styles/forms.css'
import '../../styles/catalog.css'
import '../../styles/restockRequests.css'

/**
 * Shell for every Cafetería screen: top bar (brand + sign-out) and a tab
 * nav for the panel's subroutes, rendering the active one via `<Outlet/>`.
 * Built in Phase 3 alongside the catalog screens, but intentionally
 * generic so Phases 4/5/7 (ventas/merma, pedidos, dashboard real) add tabs
 * here instead of rebuilding the layout. Phase 5 added the fourth
 * "Pedidos" tab for the restock-request flow. Phase 6 added
 * `NotificationsToggle` next to the sign-out button.
 */
export function CafeteriaLayout() {
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
          <span className="eyebrow panel-topbar-role">Cafetería</span>
        </div>
        <div className="panel-topbar-actions">
          <ThemeToggle />
          <NotificationsToggle />
          <button type="button" className="btn btn-secondary" onClick={handleSignOut}>
            Cerrar sesión
          </button>
        </div>
      </header>

      <nav className="tabs panel-nav" role="tablist" aria-label="Secciones de cafetería">
        <NavLink
          to="/cafeteria"
          end
          role="tab"
          className={({ isActive }) => `tab${isActive ? ' tab-active' : ''}`}
        >
          Dashboard
        </NavLink>
        <NavLink
          to="/cafeteria/catalogo"
          role="tab"
          className={({ isActive }) => `tab${isActive ? ' tab-active' : ''}`}
        >
          Catálogo
        </NavLink>
        <NavLink
          to="/cafeteria/movimientos"
          role="tab"
          className={({ isActive }) => `tab${isActive ? ' tab-active' : ''}`}
        >
          Movimientos
        </NavLink>
        <NavLink
          to="/cafeteria/pedidos"
          role="tab"
          className={({ isActive }) => `tab${isActive ? ' tab-active' : ''}`}
        >
          Pedidos
        </NavLink>
      </nav>

      <main className="panel-content">
        <Outlet />
      </main>
    </div>
  )
}
