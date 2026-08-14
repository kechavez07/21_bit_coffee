import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Login } from './pages/Login'
import { FinishSignIn } from './pages/FinishSignIn'
import { CafeteriaLayout } from './pages/cafeteria/CafeteriaLayout'
import { DashboardPage } from './pages/cafeteria/DashboardPage'
import { CatalogPage } from './pages/cafeteria/CatalogPage'
import { MovementsPage } from './pages/cafeteria/MovementsPage'
import { RequestsPage } from './pages/cafeteria/RequestsPage'
import { ProductionLayout } from './pages/production/ProductionLayout'
import { DashboardPage as ProductionDashboardPage } from './pages/production/DashboardPage'
import { InboxPage } from './pages/production/InboxPage'
import { QueuePage } from './pages/production/QueuePage'
import { ProtectedRoute } from './routes/ProtectedRoute'
import { RootRedirect } from './routes/RootRedirect'

/**
 * `/login` and `/finish-signin` are public. `/cafeteria` and `/production`
 * are both nested layouts, same shape: `ProtectedRoute` gates the whole
 * subtree, the panel's `*Layout` renders the top bar/tab nav plus whichever
 * child route is active via `<Outlet/>`. `/production` was a flat
 * placeholder route through Phase 4 — Phase 5 gives it real screens
 * (Dashboard/Solicitudes/Cola) alongside cafetería's new "Pedidos" tab.
 * `/` has no UI of its own — it resolves the signed-in user's role and
 * redirects to their panel.
 */
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/finish-signin" element={<FinishSignIn />} />
        <Route
          path="/cafeteria"
          element={
            <ProtectedRoute allowedRole="cafeteria">
              <CafeteriaLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="catalogo" element={<CatalogPage />} />
          <Route path="movimientos" element={<MovementsPage />} />
          <Route path="pedidos" element={<RequestsPage />} />
        </Route>
        <Route
          path="/production"
          element={
            <ProtectedRoute allowedRole="production">
              <ProductionLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<ProductionDashboardPage />} />
          <Route path="solicitudes" element={<InboxPage />} />
          <Route path="cola" element={<QueuePage />} />
        </Route>
        <Route path="/" element={<RootRedirect />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
