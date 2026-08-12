import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { signInWithPassword, sendEmailLink } from '../services/firebase/auth'
import { useAuth } from '../hooks/useAuth'
import { mapAuthError } from '../utils/authErrorMessages'
import { FullScreenStatus } from '../components/FullScreenStatus'
import '../styles/forms.css'

type Mode = 'password' | 'link'

/**
 * Login screen with two alternable sign-in modes:
 *   - Password: email + password -> `signInWithPassword`.
 *   - Email link (passwordless): email -> `sendEmailLink`.
 *
 * This screen never decides role/redirect logic itself. On password
 * sign-in success it navigates to `/`, where the root route resolves the
 * user's role and sends them to the right panel (or the unauthorized
 * screen). The email-link mode has nothing further to do here — the flow
 * continues on `/finish-signin` once the user opens the emailed link.
 */
export function Login() {
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  const [mode, setMode] = useState<Mode>('password')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [linkSent, setLinkSent] = useState(false)

  // Already signed in (e.g. typed /login manually) — let the root route
  // resolve where they belong instead of showing the form again.
  if (!authLoading && user) {
    return <Navigate to="/" replace />
  }

  if (authLoading) {
    return <FullScreenStatus variant="loading" title="Cargando…" />
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

  async function handleLinkSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await sendEmailLink(email)
      setLinkSent(true)
    } catch (err) {
      setError(mapAuthError(err))
    } finally {
      setSubmitting(false)
    }
  }

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
    setLinkSent(false)
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>21 Bit Coffee</h1>
        <p className="subtitle">Inicia sesión para continuar</p>

        <div className="tabs" role="tablist" aria-label="Método de inicio de sesión">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'password'}
            className="tab"
            onClick={() => switchMode('password')}
          >
            Contraseña
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'link'}
            className="tab"
            onClick={() => switchMode('link')}
          >
            Enlace por correo
          </button>
        </div>

        {mode === 'password' ? (
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
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && <p className="form-error">{error}</p>}
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Iniciando sesión…' : 'Iniciar sesión'}
            </button>
          </form>
        ) : linkSent ? (
          <p className="form-success">
            Revisa tu correo, te enviamos un enlace para iniciar sesión.
          </p>
        ) : (
          <form className="auth-card" onSubmit={handleLinkSubmit}>
            <div className="field">
              <label htmlFor="link-email">Correo electrónico</label>
              <input
                id="link-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {error && <p className="form-error">{error}</p>}
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Enviando…' : 'Enviar enlace'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
