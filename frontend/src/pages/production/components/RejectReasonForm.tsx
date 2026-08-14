import { useState } from 'react'
import type { FormEvent } from 'react'

interface RejectReasonFormProps {
  submitting: boolean
  error?: string | null
  onSubmit: (reason: string) => void
  onCancel: () => void
}

/**
 * Small inline form for `rejectRestockRequest`'s required `reason` —
 * mirrors the server's `nonEmptyString` rule client-side (empty/whitespace
 * reason never reaches the callable) so the rejection is caught before the
 * round trip, same posture as `DispatchForm`'s note validation.
 */
export function RejectReasonForm({ submitting, error, onSubmit, onCancel }: RejectReasonFormProps) {
  const [reason, setReason] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = reason.trim()
    if (!trimmed) {
      setLocalError('El motivo del rechazo es obligatorio.')
      return
    }
    setLocalError(null)
    onSubmit(trimmed)
  }

  return (
    <form className="catalog-panel" onSubmit={handleSubmit}>
      <h4>Rechazar pedido</h4>

      <div className="field">
        <label htmlFor="reject-reason">Motivo</label>
        <textarea
          id="reject-reason"
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Explica por qué se rechaza el pedido"
        />
      </div>

      {(localError || error) && <p className="form-error">{localError ?? error}</p>}

      <div className="catalog-panel-actions">
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Rechazando…' : 'Confirmar rechazo'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={submitting}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
