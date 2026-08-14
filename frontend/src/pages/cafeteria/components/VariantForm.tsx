import { useState } from 'react'
import type { FormEvent } from 'react'

export interface VariantCatalogFormValues {
  flavor: string | null
  minStockAlert: number
}

interface VariantFormProps {
  title: string
  initial?: VariantCatalogFormValues
  submitting: boolean
  error: string | null
  onSubmit: (values: VariantCatalogFormValues) => void
  onCancel: () => void
}

/**
 * Create/edit form for a variant's catalog fields (flavor + low-stock
 * threshold). Deliberately has NO `stock` field — per
 * `backend/firestore.rules`, catalog-field edits and stock corrections
 * are two mutually exclusive writes (see `services/firebase/catalog.ts`).
 * Stock is set once at creation time and corrected afterwards only via
 * the separate "Ajustar stock" control in `CatalogPage`.
 */
export function VariantForm({
  title,
  initial,
  submitting,
  error,
  onSubmit,
  onCancel,
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
    </form>
  )
}
