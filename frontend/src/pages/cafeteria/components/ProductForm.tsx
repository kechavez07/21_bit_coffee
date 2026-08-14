import { useState } from 'react'
import type { FormEvent } from 'react'
import { CATEGORY_LABELS, CATEGORY_ORDER } from '../../../utils/catalog'
import type { ProductCategory } from '../../../services/firebase/catalog'

export interface ProductFormValues {
  name: string
  description: string | null
  category: ProductCategory
}

interface ProductFormProps {
  title: string
  initial?: ProductFormValues
  submitting: boolean
  error: string | null
  onSubmit: (values: ProductFormValues) => void
  onCancel: () => void
}

/**
 * Create/edit form for a product's catalog fields. No `stock`/`active`
 * field here on purpose — stock lives on variants, and active is toggled
 * separately via the Desactivar/Reactivar action in `CatalogPage`.
 */
export function ProductForm({
  title,
  initial,
  submitting,
  error,
  onSubmit,
  onCancel,
}: ProductFormProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [category, setCategory] = useState<ProductCategory>(initial?.category ?? CATEGORY_ORDER[0])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit({
      name: name.trim(),
      description: description.trim() ? description.trim() : null,
      category,
    })
  }

  return (
    <form className="catalog-panel" onSubmit={handleSubmit}>
      <h3>{title}</h3>

      <div className="field">
        <label htmlFor="product-name">Nombre</label>
        <input
          id="product-name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="product-category">Categoría</label>
        <select
          id="product-category"
          value={category}
          onChange={(e) => setCategory(e.target.value as ProductCategory)}
        >
          {CATEGORY_ORDER.map((cat) => (
            <option key={cat} value={cat}>
              {CATEGORY_LABELS[cat]}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="product-description">Descripción (opcional)</label>
        <textarea
          id="product-description"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      {error && <p className="form-error">{error}</p>}

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
