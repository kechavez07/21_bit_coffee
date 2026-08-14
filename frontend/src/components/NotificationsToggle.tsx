/**
 * Push-notifications opt-in button + foreground-message toast, shared by
 * `CafeteriaLayout` and `ProductionLayout` (Phase 6) — one instance per
 * layout, rendered next to the "Cerrar sesión" button.
 *
 * Renders one of three states, driven by `useNotifications().permission`:
 *   - `'default'`: "Activar notificaciones" button.
 *   - `'granted'`: quiet "Notificaciones activas" indicator, no button.
 *   - `'denied'`: disabled button + short note (browsers give no API to
 *     re-prompt once denied — the user has to flip it in their own browser
 *     settings).
 *   - `'unsupported'`: renders nothing — there's no action the user could
 *     take, and calling it out would just be noise on unsupported browsers.
 *
 * Also owns the foreground-message toast: `useNotifications` subscribes to
 * `onForegroundMessage` internally, this component is just where it's
 * displayed (both layouts pass through this same component, so there's
 * only one place to build the toast UI). Clicking the toast navigates to
 * the relevant list screen — same `data.type` -> route mapping as the
 * background click handler in `public/firebase-messaging-sw.js` (kept in
 * sync manually: that file can't import from here, it's a plain static
 * script loaded via `importScripts`, not part of the Vite build).
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotifications } from '../hooks/useNotifications'
import './NotificationsToggle.css'

function routeForNotificationType(type: string | undefined): string | null {
  switch (type) {
    case 'restock_created':
    case 'restock_edited':
    case 'restock_received':
      return '/production/solicitudes'
    case 'restock_accepted':
    case 'restock_rejected':
    case 'restock_dispatched':
      return '/cafeteria/pedidos'
    default:
      return null
  }
}

export function NotificationsToggle() {
  const { permission, enabling, error, latestMessage, enableNotifications } = useNotifications()
  const navigate = useNavigate()
  const [toast, setToast] = useState<{ title: string; body?: string; type?: string } | null>(null)

  useEffect(() => {
    if (!latestMessage) return
    setToast({
      title: latestMessage.notification?.title ?? 'Nueva notificación',
      body: latestMessage.notification?.body,
      type: latestMessage.data?.type,
    })
  }, [latestMessage])

  function handleToastClick() {
    if (!toast) return
    const route = routeForNotificationType(toast.type)
    setToast(null)
    if (route) {
      navigate(route)
    }
  }

  return (
    <div className="notifications-toggle">
      {permission === 'default' && (
        <button
          type="button"
          className="btn btn-secondary btn-small"
          onClick={() => void enableNotifications()}
          disabled={enabling}
        >
          {enabling ? 'Activando…' : 'Activar notificaciones'}
        </button>
      )}

      {permission === 'granted' && (
        <span className="notifications-active" title="Vas a recibir notificaciones de pedidos">
          Notificaciones activas
        </span>
      )}

      {permission === 'denied' && (
        <span className="notifications-denied">
          <button type="button" className="btn btn-secondary btn-small" disabled>
            Notificaciones bloqueadas
          </button>
          <small>Habilitalas desde la configuración del navegador para este sitio.</small>
        </span>
      )}

      {error && <p className="form-error notifications-error">{error}</p>}

      {toast && (
        <div className="notifications-toast" role="status">
          <button type="button" className="notifications-toast-body" onClick={handleToastClick}>
            <strong>{toast.title}</strong>
            {toast.body && <span>{toast.body}</span>}
          </button>
          <button
            type="button"
            className="notifications-toast-close"
            aria-label="Cerrar notificación"
            onClick={() => setToast(null)}
          >
            ×
          </button>
        </div>
      )}
    </div>
  )
}
