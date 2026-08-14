import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { CATEGORY_LABELS, groupCatalogByCategory } from '../../../utils/catalog'
import type { Product, Variant } from '../../../services/firebase/catalog'
import type { RequestedItemInput } from '../../../services/firebase/restockRequests'
import '../../../styles/restockRequests.css'

/** A working (not-yet-submitted) request line — enough to render the draft table without another catalog lookup. */
export interface WorkingItem {
  variantId: string
  productName: string
  flavor: string | null
  requestedQty: number
}

interface RequestItemsFormProps {
  title: string
  products: Product[]
  variants: Variant[]
  initialItems?: WorkingItem[]
  submitting: boolean
  error: string | null
  submitLabel: string
  onSubmit: (items: RequestedItemInput[]) => void
  onCancel: () => void
}

/**
 * Item-builder shared by "Nuevo pedido" and "Editar pedido" in
 * `RequestsPage`: category-grouped variant picker (excludes variants
 * already added to the working list, mirroring `MovementsPage`'s picker
 * pattern) + quantity + "Agregar", a running table of added items with a
 * "Quitar" per row, and a final submit button whose label the caller
 * controls (create vs. edit use different copy).
 */
export function RequestItemsForm({
  title,
  products,
  variants,
  initialItems,
  submitting,
  error,
  submitLabel,
  onSubmit,
  onCancel,
}: RequestItemsFormProps) {
  const [items, setItems] = useState<WorkingItem[]>(initialItems ?? [])
  const [variantId, setVariantId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [pickerError, setPickerError] = useState<string | null>(null)

  const addedVariantIds = useMemo(() => new Set(items.map((item) => item.variantId)), [items])
  const productsById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])
  const variantsById = useMemo(() => new Map(variants.map((v) => [v.id, v])), [variants])

  const groups = useMemo(() => {
    return groupCatalogByCategory(products, variants).map((group) => ({
      category: group.category,
      products: group.products.map((entry) => ({
        product: entry.product,
        variants: entry.variants.filter((v) => v.active && !addedVariantIds.has(v.id)),
      })),
    }))
  }, [products, variants, addedVariantIds])

  function handleAddItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPickerError(null)

    if (!variantId) {
      setPickerError('Selecciona una variante.')
      return
    }
    const parsedQuantity = Number.parseInt(quantity, 10)
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      setPickerError('La cantidad debe ser un número entero mayor a 0.')
      return
    }

    const variant = variantsById.get(variantId)
    const product = variant ? productsById.get(variant.productId) : undefined
    if (!variant || !product) {
      setPickerError('La variante seleccionada ya no está disponible.')
      return
    }

    setItems((current) => [
      ...current,
      {
        variantId,
        productName: product.name,
        flavor: variant.flavor,
        requestedQty: parsedQuantity,
      },
    ])
    setVariantId('')
    setQuantity('1')
  }

  function handleRemoveItem(variantIdToRemove: string) {
    setItems((current) => current.filter((item) => item.variantId !== variantIdToRemove))
  }

  function handleSubmit() {
    if (items.length === 0) return
    onSubmit(items.map((item) => ({ variantId: item.variantId, requestedQty: item.requestedQty })))
  }

  return (
    <div className="catalog-panel">
      <h3>{title}</h3>

      <form className="restock-item-picker" onSubmit={handleAddItem}>
        <div className="field">
          <label htmlFor="restock-item-variant">Variante</label>
          <select
            id="restock-item-variant"
            value={variantId}
            onChange={(e) => setVariantId(e.target.value)}
          >
            <option value="">Selecciona una variante</option>
            {groups.map((group) =>
              group.products.every((entry) => entry.variants.length === 0) ? null : (
                <optgroup key={group.category} label={CATEGORY_LABELS[group.category]}>
                  {group.products.flatMap(({ product, variants: productVariants }) =>
                    productVariants.map((variant) => (
                      <option key={variant.id} value={variant.id}>
                        {variant.flavor ? `${product.name} — ${variant.flavor}` : product.name}
                      </option>
                    )),
                  )}
                </optgroup>
              ),
            )}
          </select>
        </div>

        <div className="field field-quantity">
          <label htmlFor="restock-item-quantity">Cantidad</label>
          <input
            id="restock-item-quantity"
            type="number"
            min={1}
            step={1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </div>

        <button type="submit" className="btn btn-secondary btn-small">
          + Agregar
        </button>
      </form>

      {pickerError && <p className="form-error">{pickerError}</p>}

      {items.length === 0 ? (
        <p className="catalog-empty">Todavía no agregaste ningún producto.</p>
      ) : (
        <table className="restock-draft-table">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Sabor</th>
              <th>Cantidad</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.variantId}>
                <td>{item.productName}</td>
                <td>{item.flavor ?? '—'}</td>
                <td>{item.requestedQty}</td>
                <td>
                  <button
                    type="button"
                    className="btn btn-secondary btn-small"
                    onClick={() => handleRemoveItem(item.variantId)}
                  >
                    Quitar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {error && <p className="form-error">{error}</p>}

      <div className="catalog-panel-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={submitting || items.length === 0}
          onClick={handleSubmit}
        >
          {submitting ? 'Guardando…' : submitLabel}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={submitting}>
          Cancelar
        </button>
      </div>
    </div>
  )
}
