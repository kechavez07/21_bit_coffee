import { useState } from 'react'
import type { FormEvent } from 'react'

export interface VariantCatalogFormValues {
  flavor: string | null
  minStockAlert: number
}

/**
 * Drives the "Zona de peligro" section — a small discriminated union so
 * the button/message can't land in an inconsistent combination (e.g.
 * "blocked" with no reason). See `CatalogPage`'s `deleteState` for how
 * this gets produced.
 */
export type VariantDeleteState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'blocked'; message: string }
  | { kind: 'failed'; message: string }

interface VariantFormProps {
  title: string
  initial?: VariantCatalogFormValues
  submitting: boolean
  error: string | null
  onSubmit: (values: VariantCatalogFormValues) => void
  onCancel: () => void
  /** Only passed by `CatalogPage` in edit mode — the create-variant path
   * (`NewVariantForm`) has nothing to delete yet, so it gets neither prop. */
  deleteState?: VariantDeleteState
  onRequestDelete?: () => void
}

/**
 * Create/edit form for a variant's catalog fields (flavor + low-stock
 * threshold). Deliberately has NO `stock` field — per
 * `backend/firestore.rules`, catalog-field edits and stock corrections
 * are two mutually exclusive writes (see `services/firebase/catalog.ts`).
 * Stock is set once at creation time and corrected afterwards only via
 * the separate "Ajustar stock" control in `CatalogPage`.
 *
 * In edit mode only (`deleteState`/`onRequestDelete` present), also renders
 * a "Zona de peligro" section below the fields for the variant hard-delete
 * flow — see `CatalogPage` for the state machine and `services/firebase/
 * catalog.ts` for what actually gets called.
 */
export function VariantForm({
  title,
  initial,
  submitting,
  error,
  onSubmit,
  onCancel,
  deleteState,
  onRequestDelete,
}: VariantFormProps) {
  const [flavor, setFlavor] = useState(initial?.flavor ?? '')
  const [minStockAlert, setMinStockAlert] = useState(String(initial?.minStockAlert ?? 0))
  const [localError, setLocalError] = useState<string | null>(null)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLocalError(null)

    const parsedMin = Number.parseInt(minStockAlert, 10)
    if (!Number.isFinite(parsedMin) || parsedMin < 0) {
      setLocalError('El stock mínimo debe ser un número entero mayor o igual a 0.')
      return
    }

    onSubmit({
      flavor: flavor.trim() ? flavor.trim() : null,
      minStockAlert: parsedMin,
    })
  }

  return (
    <form className="catalog-panel" onSubmit={handleSubmit}>
      <h4>{title}</h4>

      <div className="field">
        <label htmlFor="variant-flavor">Sabor (opcional)</label>
        <input
          id="variant-flavor"
          type="text"
          value={flavor}
          onChange={(e) => setFlavor(e.target.value)}
          placeholder="Dejar vacío si el producto no tiene sabores"
        />
      </div>

      <div className="field">
        <label htmlFor="variant-min-stock">Stock mínimo (alerta)</label>
        <input
          id="variant-min-stock"
          type="number"
          min={0}
          step={1}
          required
          value={minStockAlert}
          onChange={(e) => setMinStockAlert(e.target.value)}
          onWheel={(e) => e.currentTarget.blur()}
        />
      </div>

      {(localError || error) && <p className="form-error">{localError ?? error}</p>}

      <div className="catalog-panel-actions">
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={submitting}>
          Cancelar
        </button>
      </div>

      {deleteState && onRequestDelete && (
        <div className="catalog-danger-zone">
          <span className="catalog-danger-zone-label">Zona de peligro</span>
          <button
            type="button"
            className="btn btn-danger btn-small"
            onClick={onRequestDelete}
            disabled={submitting || deleteState.kind === 'checking'}
          >
            {deleteState.kind === 'checking' ? 'Verificando…' : 'Eliminar variante'}
          </button>
          {(deleteState.kind === 'blocked' || deleteState.kind === 'failed') && (
            <p className="form-error">{deleteState.message}</p>
          )}
        </div>
      )}
    </form>
  )
}
