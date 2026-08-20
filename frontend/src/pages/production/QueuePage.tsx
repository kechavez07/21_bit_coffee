import { useMemo, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useRestockRequests } from '../../hooks/useRestockRequests'
import {
  dispatchRestockRequest,
  type DispatchItemInput,
  type RestockRequest,
} from '../../services/firebase/restockRequests'
import { RestockRequestDetail } from '../../components/RestockRequestDetail'
import { FullScreenStatus } from '../../components/FullScreenStatus'
import { DispatchForm } from './components/DispatchForm'
import '../../styles/restockRequests.css'

/**
 * Pastelería's "Cola" tab: `queued` requests, each with a `DispatchForm`
 * to record what actually gets sent (defaults to the full requested
 * quantity per item, editable).
 */
export function QueuePage() {
  const { user } = useAuth()
  const { requests, loading, error } = useRestockRequests()

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [dispatchingId, setDispatchingId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const queuedRequests = useMemo(
    () => requests.filter((request) => request.status === 'queued'),
    [requests],
  )

  function toggleExpanded(requestId: string) {
    setExpandedId((current) => (current === requestId ? null : requestId))
    setDispatchingId(null)
    setFormError(null)
  }

  async function handleDispatch(request: RestockRequest, items: DispatchItemInput[]) {
    setSubmitting(true)
    setFormError(null)
    try {
      await dispatchRestockRequest(request.id, items)
      setDispatchingId(null)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'No se pudo despachar el pedido.')
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
        title="No se pudo cargar la cola"
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
          <h1>Cola de despacho</h1>
          <p>Pedidos aceptados, listos para preparar y despachar.</p>
        </div>
      </div>

      {queuedRequests.length === 0 ? (
        <p className="catalog-empty">No hay pedidos en cola.</p>
      ) : (
        <ul className="restock-list">
          {queuedRequests.map((request) => (
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
                      dispatchingId === request.id ? undefined : (
                        <button
                          type="button"
                          className="btn btn-primary btn-small"
                          onClick={() => {
                            setDispatchingId(request.id)
                            setFormError(null)
                          }}
                        >
                          Despachar
                        </button>
                      )
                    }
                  />

                  {dispatchingId === request.id && (
                    <DispatchForm
                      request={request}
                      submitting={submitting}
                      error={formError}
                      onSubmit={(items) => handleDispatch(request, items)}
                      onCancel={() => {
                        setDispatchingId(null)
                        setFormError(null)
                      }}
                    />
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
