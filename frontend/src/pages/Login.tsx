import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { signInWithPassword } from '../services/firebase/auth'
import { useAuth } from '../hooks/useAuth'
import { mapAuthError } from '../utils/authErrorMessages'
import { FullScreenStatus } from '../components/FullScreenStatus'
import { BrandMark } from '../components/BrandMark'
import { ThemeToggle } from '../components/ThemeToggle'
import '../styles/forms.css'

/**
 * Login screen — email + password via `signInWithPassword`.
 *
 * This screen never decides role/redirect logic itself. On sign-in success
 * it navigates to `/`, where the root route resolves the user's role and
 * sends them to the right panel (or the unauthorized screen).
 */
export function Login() {
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Already signed in (e.g. typed /login manually) — let the root route
  // resolve where they belong instead of showing the form again.
  if (!authLoading && user) {
    return <Navigate to="/" replace />
  }

  if (authLoading) {
    return <FullScreenStatus variant="loading" title="Cargando…" showBrand />
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await signInWithPassword(email, password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(mapAuthError(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-page-theme-toggle">
        <ThemeToggle />
      </div>
      <div className="auth-shell">
        <div className="auth-brand">
          <BrandMark size="lg" />
        </div>
        <div className="auth-card">
          <p className="eyebrow">Panel interno</p>
          <h1>Inicia sesión</h1>
          <p className="subtitle">Accede para gestionar cafetería y producción</p>

          <form className="auth-card" onSubmit={handlePasswordSubmit}>
            <div className="field">
              <label htmlFor="email">Correo electrónico</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="password">Contraseña</label>
              <div className="field-password">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="field-password-toggle"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
            </div>
            {error && <p className="form-error">{error}</p>}
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Iniciando sesión…' : 'Iniciar sesión'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
