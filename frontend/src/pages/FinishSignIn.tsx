import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { completeEmailLinkSignIn, isEmailLinkSignIn } from '../services/firebase/auth'
import { mapAuthError } from '../utils/authErrorMessages'
import { FullScreenStatus } from '../components/FullScreenStatus'
import '../styles/forms.css'

type Status = 'checking' | 'needs-email' | 'error'

/**
 * Completion step of the passwordless (email-link) sign-in flow, mounted
 * at `/finish-signin` — the URL Firebase's emailed link points back to.
 *
 * - Not a valid sign-in link -> error screen (expired/already used/typo).
 * - Valid link, email cached on this device (`localStorage`) ->
 *   `completeEmailLinkSignIn` resolves silently and we redirect to `/`,
 *   where role resolution takes over.
 * - Valid link, no cached email (link opened on a different device) ->
 *   `completeEmailLinkSignIn` rejects with `EMAIL_REQUIRED`; we ask for
 *   the email via a form (never `window.prompt`) and retry.
 */
export function FinishSignIn() {
  const navigate = useNavigate()
  // Guards against firing the sign-in exchange twice under
  // React StrictMode's dev double-invoke of effects.
  const attempted = useRef(false)

  const [status, setStatus] = useState<Status>('checking')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (attempted.current) return
    attempted.current = true

    const url = window.location.href

    if (!isEmailLinkSignIn(url)) {
      setErrorMessage('Este enlace no es válido o ya expiró.')
      setStatus('error')
      return
    }

    completeEmailLinkSignIn(url)
      .then(() => {
        navigate('/', { replace: true })
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.message === 'EMAIL_REQUIRED') {
          setStatus('needs-email')
          return
        }
        setErrorMessage(mapAuthError(err))
        setStatus('error')
      })
  }, [navigate])

  async function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setErrorMessage(null)
    try {
      await completeEmailLinkSignIn(window.location.href, email)
      navigate('/', { replace: true })
    } catch (err) {
      setErrorMessage(mapAuthError(err))
      setStatus('error')
    } finally {
      setSubmitting(false)
    }
  }

  if (status === 'checking') {
    return <FullScreenStatus variant="loading" title="Confirmando tu inicio de sesión…" />
  }

  if (status === 'needs-email') {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>Confirma tu correo</h1>
          <p className="subtitle">
            Abriste este enlace en un dispositivo distinto. Escribe el correo al que te lo
            enviamos para continuar.
          </p>
          <form className="auth-card" onSubmit={handleEmailSubmit}>
            <div className="field">
              <label htmlFor="confirm-email">Correo electrónico</label>
              <input
                id="confirm-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {errorMessage && <p className="form-error">{errorMessage}</p>}
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Confirmando…' : 'Continuar'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <FullScreenStatus
      variant="error"
      title="No se pudo iniciar sesión"
      description={errorMessage ?? undefined}
      action={
        <Link to="/login" className="btn btn-secondary">
          Volver al inicio de sesión
        </Link>
      }
    />
  )
}
