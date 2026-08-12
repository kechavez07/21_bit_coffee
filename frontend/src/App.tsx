import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Login } from './pages/Login'
import { FinishSignIn } from './pages/FinishSignIn'
import { CafeteriaPanel } from './pages/CafeteriaPanel'
import { ProductionPanel } from './pages/ProductionPanel'
import { ProtectedRoute } from './routes/ProtectedRoute'
import { RootRedirect } from './routes/RootRedirect'

/**
 * Phase 1: auth + role-gated routing.
 *
 * `/login` and `/finish-signin` are public. `/cafeteria` and `/production`
 * are placeholder panels (real screens land in Phase 2+) gated by
 * `ProtectedRoute`, which requires a signed-in user with the matching
 * role. `/` has no UI of its own — it resolves the signed-in user's role
 * and redirects to their panel.
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
              <CafeteriaPanel />
            </ProtectedRoute>
          }
        />
        <Route
          path="/production"
          element={
            <ProtectedRoute allowedRole="production">
              <ProductionPanel />
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<RootRedirect />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
