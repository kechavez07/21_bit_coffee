/**
 * Shared restock-request detail view: items table, status badge, rejection
 * reason (if rejected), and the comments thread. Used by both roles'
 * inboxes/lists (`pages/cafeteria/RequestsPage.tsx`,
 * `pages/production/InboxPage.tsx`/`QueuePage.tsx`) so the item table and
 * comment thread only exist once.
 *
 * `role`/`uid` are plain props, not re-derived via `useUserRole`/`useAuth`
 * here — the enclosing route (`ProtectedRoute allowedRole=...`) already
 * guarantees the role, same reasoning `CatalogPage` already relies on.
 *
 * Role-specific buttons (Aceptar/Rechazar, Editar, Confirmar recepción,
 * Despachar…) are NOT built here — callers inject them via the `actions`
 * slot, keeping this component free of any one role's business rules.
 */
import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useComments } from '../hooks/useComments'
import { addComment, type RestockRequest } from '../services/firebase/restockRequests'
import type { UserRole } from '../services/firebase/auth'
import { ROLE_LABELS, STATUS_LABELS } from '../utils/restockRequests'
import { useToast } from '../hooks/useToast'
import '../styles/restockRequests.css'

export interface RestockRequestDetailProps {
  request: RestockRequest
  role: UserRole
  uid: string
  actions?: ReactNode
}

export function RestockRequestDetail({ request, role, uid, actions }: RestockRequestDetailProps) {
  const { showToast } = useToast()
  const { comments, loading: commentsLoading, error: commentsError } = useComments(request.id)
  const [commentText, setCommentText] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)
  const [commentError, setCommentError] = useState<string | null>(null)

  const showDispatchColumns = request.items.some((item) => item.dispatchedQty !== undefined)

  async function handleAddComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = commentText.trim()
    if (!trimmed) return

    setSubmittingComment(true)
    setCommentError(null)
    try {
      await addComment(request.id, trimmed, uid, role)
      setCommentText('')
      showToast('success', 'Comentario agregado.')
    } catch (err) {
      setCommentError(err instanceof Error ? err.message : 'No se pudo enviar el comentario.')
    } finally {
      setSubmittingComment(false)
    }
  }

  return (
    <div className="restock-detail">
      <div className="restock-detail-header">
        <span className={`badge badge-status-${request.status}`}>{STATUS_LABELS[request.status]}</span>
        <span className="restock-detail-meta">Pedido el {formatTimestamp(request.createdAt)}</span>
      </div>

      {request.status === 'rejected' && request.rejectionReason && (
        <p className="restock-rejection-reason">Motivo del rechazo: {request.rejectionReason}</p>
      )}

      <div className="restock-table-wrap card">
        <table className="restock-items-table">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Sabor</th>
              <th>Pedido</th>
              {showDispatchColumns && <th>Despachado</th>}
              {showDispatchColumns && <th>Nota</th>}
            </tr>
          </thead>
          <tbody>
            {request.items.map((item) => (
              <tr key={item.variantId}>
                <td>{item.productName}</td>
                <td>{item.flavor ?? '—'}</td>
                <td>{item.requestedQty}</td>
                {showDispatchColumns && <td>{item.dispatchedQty ?? '—'}</td>}
                {showDispatchColumns && <td>{item.dispatchNote ?? '—'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {actions && <div className="restock-detail-actions">{actions}</div>}

      <section className="restock-comments">
        <h4>Comentarios</h4>

        {commentsError && (
          <p className="form-error">No se pudieron cargar los comentarios. Intenta de nuevo.</p>
        )}

        {commentsLoading && !commentsError ? (
          <p className="catalog-empty">Cargando comentarios…</p>
        ) : comments.length === 0 ? (
          <p className="catalog-empty">Todavía no hay comentarios.</p>
        ) : (
          <ul className="restock-comments-list">
            {comments.map((comment) => (
              <li key={comment.id} className="restock-comment">
                <span className="restock-comment-author">
                  {ROLE_LABELS[comment.authorRole]}
                  {comment.authorUid === uid ? ' (tú)' : ''}
                </span>
                <span className="restock-comment-text">{comment.text}</span>
                <span className="restock-comment-meta">{formatTimestamp(comment.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}

        <form className="restock-comment-form" onSubmit={handleAddComment}>
          <textarea
            aria-label="Nuevo comentario"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Escribe un comentario…"
            rows={2}
            maxLength={2000}
          />
          {commentError && <p className="form-error">{commentError}</p>}
          <button
            type="submit"
            className="btn btn-secondary btn-small"
            disabled={submittingComment || !commentText.trim()}
          >
            {submittingComment ? 'Enviando…' : 'Comentar'}
          </button>
        </form>
      </section>
    </div>
  )
}

/** Firestore `Timestamp` -> locale date/time string. Same fallback posture as `MovementsPage`'s local helper — `serverTimestamp()` reads back as `null` on the writer's own optimistic snapshot until the server round-trips it. */
function formatTimestamp(timestamp: unknown): string {
  if (
    timestamp &&
    typeof timestamp === 'object' &&
    'toDate' in timestamp &&
    typeof (timestamp as { toDate: unknown }).toDate === 'function'
  ) {
    return (timestamp as { toDate: () => Date }).toDate().toLocaleString('es')
  }
  return 'Guardando…'
}
