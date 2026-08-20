import { useMemo, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useRestockRequests } from '../../hooks/useRestockRequests'
import {
  acceptRestockRequest,
  rejectRestockRequest,
  type RestockRequest,
} from '../../services/firebase/restockRequests'
import { RestockRequestDetail } from '../../components/RestockRequestDetail'
import { FullScreenStatus } from '../../components/FullScreenStatus'
import { RejectReasonForm } from './components/RejectReasonForm'
import { STATUS_LABELS } from '../../utils/restockRequests'
import '../../styles/restockRequests.css'

const RECENT_RESOLVED_LIMIT = 10

/**
 * Pastelería's "Solicitudes" tab: `pending` requests with Aceptar/Rechazar
 * actions, plus a short read-only "resueltos recientemente" list below
 * (last ~10 non-pending requests) for context, without needing a separate
 * history tab.
 */
export function InboxPage() {
  const { user } = useAuth()
  const { requests, loading, error } = useRestockRequests()

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const pendingRequests = useMemo(
    () => requests.filter((request) => request.status === 'pending'),
    [requests],
  )
  const recentResolved = useMemo(
    () => requests.filter((request) => request.status !== 'pending').slice(0, RECENT_RESOLVED_LIMIT),
    [requests],
  )

  function toggleExpanded(requestId: string) {
    setExpandedId((current) => (current === requestId ? null : requestId))
    setRejectingId(null)
    setActionError(null)
  }

  async function handleAccept(request: RestockRequest) {
    setActionError(null)
    try {
      await acceptRestockRequest(request.id)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo aceptar el pedido.')
    }
  }

  async function handleReject(request: RestockRequest, reason: string) {
    setSubmitting(true)
    setActionError(null)
    try {
      await rejectRestockRequest(request.id, reason)
      setRejectingId(null)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo rechazar el pedido.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <FullScreenStatus variant="loading" title="Cargando…" />
  }

  if (error) {
    return (
      <FullScreenStatus
        variant="error"
        title="No se pudieron cargar los pedidos"
        description="Ocurrió un problema al cargar los datos. Intenta de nuevo."
      />
    )
  }

  if (!user) {
    return null
  }

  return (
    <div className="restock-page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="eyebrow">Producción</p>
          <h1>Solicitudes</h1>
          <p>Pedidos pendientes de cafetería, para aceptar o rechazar.</p>
        </div>
      </div>

      {actionError && <p className="form-error">{actionError}</p>}

      {pendingRequests.length === 0 ? (
        <p className="catalog-empty">No hay pedidos pendientes.</p>
      ) : (
        <ul className="restock-list">
          {pendingRequests.map((request) => (
            <li key={request.id} className="restock-list-item card">
              <button
                type="button"
                className="restock-list-item-summary"
                onClick={() => toggleExpanded(request.id)}
              >
                <span className="restock-list-item-title">{request.items.length} producto(s)</span>
                <span className="restock-list-item-meta">
                  {expandedId === request.id ? 'Ocultar' : 'Ver detalle'}
                </span>
              </button>

              {expandedId === request.id && (
                <div className="restock-list-item-body">
                  <RestockRequestDetail
                    request={request}
                    role="production"
                    uid={user.uid}
                    actions={
                      rejectingId === request.id ? undefined : (
                        <>
                          <button
                            type="button"
                            className="btn btn-primary btn-small"
                            onClick={() => handleAccept(request)}
                          >
                            Aceptar
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-small"
                            onClick={() => setRejectingId(request.id)}
                          >
                            Rechazar
                          </button>
                        </>
                      )
                    }
                  />

                  {rejectingId === request.id && (
                    <RejectReasonForm
                      submitting={submitting}
                      onSubmit={(reason) => handleReject(request, reason)}
                      onCancel={() => setRejectingId(null)}
                    />
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <section>
        <h3>Resueltos recientemente</h3>
        {recentResolved.length === 0 ? (
          <p className="catalog-empty">Todavía no hay pedidos resueltos.</p>
        ) : (
          <ul className="restock-list">
            {recentResolved.map((request) => (
              <RecentResolvedItem key={request.id} request={request} uid={user.uid} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

/** Read-only row for the "resueltos recientemente" list — no `actions` slot passed to `RestockRequestDetail`. */
function RecentResolvedItem({ request, uid }: { request: RestockRequest; uid: string }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <li className="restock-list-item card">
      <button type="button" className="restock-list-item-summary" onClick={() => setExpanded((v) => !v)}>
        <span className="restock-list-item-title">
          {request.items.length} producto(s) — {STATUS_LABELS[request.status]}
        </span>
        <span className="restock-list-item-meta">{expanded ? 'Ocultar' : 'Ver detalle'}</span>
      </button>

      {expanded && (
        <div className="restock-list-item-body">
          <RestockRequestDetail request={request} role="production" uid={uid} />
        </div>
      )}
    </li>
  )
}
