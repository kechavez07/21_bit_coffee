import { useMemo, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useCatalog } from '../../hooks/useCatalog'
import { useRestockRequests } from '../../hooks/useRestockRequests'
import {
  confirmReceipt,
  createRestockRequest,
  editPendingRequest,
  type RequestedItemInput,
  type RestockRequest,
} from '../../services/firebase/restockRequests'
import { RestockRequestDetail } from '../../components/RestockRequestDetail'
import { FullScreenStatus } from '../../components/FullScreenStatus'
import { useToast } from '../../hooks/useToast'
import { RequestItemsForm, type WorkingItem } from './components/RequestItemsForm'
import { STATUS_LABELS } from '../../utils/restockRequests'
import '../../styles/restockRequests.css'

type FormTarget = { kind: 'new' } | { kind: 'edit'; request: RestockRequest } | null

/**
 * Cafetería's "Pedidos" tab: create a restock request, see the full
 * history of her own requests (any status, newest first, each expandable
 * into `RestockRequestDetail`), edit a still-`pending` one, and confirm
 * receipt once one comes back `dispatched`. Every write goes through the
 * `restock_requests` callables (`services/firebase/restockRequests.ts`) —
 * this screen never writes to the request doc directly.
 */
export function RequestsPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const { products, variants, loading: catalogLoading, error: catalogError } = useCatalog()
  const { requests, loading: requestsLoading, error: requestsError } = useRestockRequests()

  const [formTarget, setFormTarget] = useState<FormTarget>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const ownRequests = useMemo(
    () => (user ? requests.filter((request) => request.requestedBy === user.uid) : []),
    [requests, user],
  )

  function closeForm() {
    setFormTarget(null)
    setFormError(null)
  }

  function toggleExpanded(requestId: string) {
    setExpandedId((current) => (current === requestId ? null : requestId))
    if (formTarget?.kind === 'edit' && formTarget.request.id === requestId) {
      closeForm()
    }
  }

  async function handleCreate(items: RequestedItemInput[]) {
    setSubmitting(true)
    setFormError(null)
    try {
      await createRestockRequest(items)
      closeForm()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'No se pudo enviar el pedido.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleEdit(request: RestockRequest, items: RequestedItemInput[]) {
    setSubmitting(true)
    setFormError(null)
    try {
      await editPendingRequest(request.id, items)
      closeForm()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'No se pudieron guardar los cambios.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleConfirmReceipt(request: RestockRequest) {
    setActionError(null)
    try {
      await confirmReceipt(request.id)
      showToast('success', 'Recepción confirmada.')
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo confirmar la recepción.')
    }
  }

  if (catalogLoading || requestsLoading) {
    return <FullScreenStatus variant="loading" title="Cargando…" />
  }

  if (catalogError || requestsError) {
    return (
      <FullScreenStatus
        variant="error"
        title="No se pudo cargar la información"
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
          <p className="eyebrow">Cafetería</p>
          <h1>Pedidos</h1>
          <p>Solicita reabastecimiento y revisa el estado de tus pedidos.</p>
        </div>
        <div className="page-header-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setFormTarget({ kind: 'new' })
              setFormError(null)
              setExpandedId(null)
            }}
          >
            + Nuevo pedido
          </button>
        </div>
      </div>

      {formTarget?.kind === 'new' && (
        <RequestItemsForm
          title="Nuevo pedido"
          products={products}
          variants={variants}
          submitting={submitting}
          error={formError}
          submitLabel="Enviar pedido"
          onSubmit={handleCreate}
          onCancel={closeForm}
        />
      )}

      {actionError && <p className="form-error">{actionError}</p>}

      {ownRequests.length === 0 ? (
        <p className="catalog-empty">Todavía no hiciste ningún pedido.</p>
      ) : (
        <ul className="restock-list">
          {ownRequests.map((request) => (
            <li key={request.id} className="restock-list-item card">
              <button
                type="button"
                className="restock-list-item-summary"
                onClick={() => toggleExpanded(request.id)}
              >
                <span className="restock-list-item-title">
                  {request.items.length} producto(s) — {STATUS_LABELS[request.status]}
                </span>
                <span className="restock-list-item-meta">
                  {expandedId === request.id ? 'Ocultar' : 'Ver detalle'}
                </span>
              </button>

              {expandedId === request.id && (
                <div className="restock-list-item-body">
                  {formTarget?.kind === 'edit' && formTarget.request.id === request.id ? (
                    <RequestItemsForm
                      title="Editar pedido"
                      products={products}
                      variants={variants}
                      initialItems={request.items.map(
                        (item): WorkingItem => ({
                          variantId: item.variantId,
                          productName: item.productName,
                          flavor: item.flavor,
                          requestedQty: item.requestedQty,
                        }),
                      )}
                      submitting={submitting}
                      error={formError}
                      submitLabel="Guardar cambios"
                      onSubmit={(items) => handleEdit(request, items)}
                      onCancel={closeForm}
                    />
                  ) : (
                    <RestockRequestDetail
                      request={request}
                      role="cafeteria"
                      uid={user.uid}
                      actions={
                        <>
                          {request.status === 'pending' && (
                            <button
                              type="button"
                              className="btn btn-secondary btn-small"
                              onClick={() => {
                                setFormTarget({ kind: 'edit', request })
                                setFormError(null)
                              }}
                            >
                              Editar
                            </button>
                          )}
                          {request.status === 'dispatched' && (
                            <button
                              type="button"
                              className="btn btn-primary btn-small"
                              onClick={() => handleConfirmReceipt(request)}
                            >
                              Confirmar recepción
                            </button>
                          )}
                        </>
                      }
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
