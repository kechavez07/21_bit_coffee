import { useState } from 'react'
import type { FormEvent } from 'react'
import type { DispatchItemInput, RestockRequest } from '../../../services/firebase/restockRequests'
import '../../../styles/restockRequests.css'

interface DraftRow {
  variantId: string
  productName: string
  flavor: string | null
  requestedQty: number
  dispatchedQty: string
  dispatchNote: string
}

interface DispatchFormProps {
  request: RestockRequest
  submitting: boolean
  error: string | null
  onSubmit: (items: DispatchItemInput[]) => void
  onCancel: () => void
}

/**
 * Dispatch form for a `queued` request: one row per item, dispatched
 * quantity pre-filled with the requested quantity (editable), and a note
 * field. The note becomes required — client-side, with immediate feedback
 * — the moment a row's dispatched quantity differs from what was
 * requested, mirroring EXACTLY the rule `dispatchRestockRequest` enforces
 * server-side (see `backend/functions/lib/restockRequests.js`): this is
 * only a UX shortcut, the callable re-validates regardless.
 */
export function DispatchForm({ request, submitting, error, onSubmit, onCancel }: DispatchFormProps) {
  const [rows, setRows] = useState<DraftRow[]>(() =>
    request.items.map((item) => ({
      variantId: item.variantId,
      productName: item.productName,
      flavor: item.flavor,
      requestedQty: item.requestedQty,
      dispatchedQty: String(item.requestedQty),
      dispatchNote: '',
    })),
  )
  const [localError, setLocalError] = useState<string | null>(null)

  function updateRow(variantId: string, patch: Partial<DraftRow>) {
    setRows((current) =>
      current.map((row) => (row.variantId === variantId ? { ...row, ...patch } : row)),
    )
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLocalError(null)

    const resolved: DispatchItemInput[] = []
    for (const row of rows) {
      const parsedQty = Number.parseInt(row.dispatchedQty, 10)
      if (!Number.isFinite(parsedQty) || parsedQty < 0) {
        setLocalError(
          `La cantidad despachada de "${row.productName}" debe ser un entero mayor o igual a 0.`,
        )
        return
      }

      const trimmedNote = row.dispatchNote.trim()
      const mismatch = parsedQty !== row.requestedQty
      if (mismatch && !trimmedNote) {
        setLocalError(
          `"${row.productName}" tiene una cantidad distinta a la pedida (${row.requestedQty}) — agrega una nota explicando por qué.`,
        )
        return
      }

      resolved.push({
        variantId: row.variantId,
        dispatchedQty: parsedQty,
        ...(trimmedNote ? { dispatchNote: trimmedNote } : {}),
      })
    }

    onSubmit(resolved)
  }

  return (
    <form className="catalog-panel" onSubmit={handleSubmit}>
      <h3>Despachar pedido</h3>

      {rows.map((row) => {
        const parsedQty = Number.parseInt(row.dispatchedQty, 10)
        const mismatch = Number.isFinite(parsedQty) && parsedQty !== row.requestedQty

        return (
          <div key={row.variantId} className="dispatch-item-row">
            <div className="dispatch-item-info">
              <span>
                {row.productName}
                {row.flavor ? ` — ${row.flavor}` : ''}
              </span>
              <span className="dispatch-item-info-requested">Pedido: {row.requestedQty}</span>
            </div>

            <div className="field">
              <label htmlFor={`dispatch-qty-${row.variantId}`}>Despachado</label>
              <input
                id={`dispatch-qty-${row.variantId}`}
                className="dispatch-item-qty"
                type="number"
                min={0}
                step={1}
                value={row.dispatchedQty}
                onChange={(e) => updateRow(row.variantId, { dispatchedQty: e.target.value })}
              />
            </div>

            <div className="field dispatch-item-note">
              <label htmlFor={`dispatch-note-${row.variantId}`}>
                Nota {mismatch ? '(obligatoria)' : '(opcional)'}
              </label>
              <input
                id={`dispatch-note-${row.variantId}`}
                type="text"
                value={row.dispatchNote}
                onChange={(e) => updateRow(row.variantId, { dispatchNote: e.target.value })}
                placeholder={mismatch ? 'Explica la diferencia' : 'Opcional'}
              />
            </div>
          </div>
        )
      })}

      {(localError || error) && <p className="form-error">{localError ?? error}</p>}

      <div className="catalog-panel-actions">
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Despachando…' : 'Confirmar despacho'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={submitting}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
