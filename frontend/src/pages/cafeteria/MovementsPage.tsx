import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useCatalog } from '../../hooks/useCatalog'
import { useMovements, type MovementEntry } from '../../hooks/useMovements'
import { CATEGORY_LABELS, groupCatalogByCategory } from '../../utils/catalog'
import { mapFirestoreError } from '../../utils/firestoreErrorMessages'
import { registerSale, registerWaste } from '../../services/firebase/movements'
import type { Product, Variant } from '../../services/firebase/catalog'
import { FullScreenStatus } from '../../components/FullScreenStatus'
import '../../styles/forms.css'
import '../../styles/catalog.css'
import '../../styles/movements.css'

type MovementType = 'sale' | 'waste'

/**
 * Cafetería's sale/waste registration screen: a form on top (type toggle,
 * variant picker grouped by category, quantity, and a "Motivo" field that
 * only applies to merma) and the recent-movements history below it. Every
 * write goes through `movements.ts`'s atomic transactions — this component
 * never touches `variants.stock` directly.
 */
export function MovementsPage() {
  const { user } = useAuth()
  const { products, variants, loading: catalogLoading, error: catalogError } = useCatalog()
  const { movements, loading: movementsLoading, error: movementsError } = useMovements()

  const groups = useMemo(() => groupCatalogByCategory(products, variants), [products, variants])
  const productsById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])
  const variantsById = useMemo(() => new Map(variants.map((v) => [v.id, v])), [variants])

  const [type, setType] = useState<MovementType>('sale')
  const [variantId, setVariantId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  function resetForm() {
    setVariantId('')
    setQuantity('1')
    setReason('')
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)

    if (!user) return

    if (!variantId) {
      setFormError('Selecciona una variante.')
      return
    }

    const parsedQuantity = Number.parseInt(quantity, 10)
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      setFormError('La cantidad debe ser un número entero mayor a 0.')
      return
    }

    setSubmitting(true)
    try {
      if (type === 'sale') {
        await registerSale({ variantId, quantity: parsedQuantity }, user.uid)
      } else {
        await registerWaste(
          { variantId, quantity: parsedQuantity, reason: reason.trim() ? reason.trim() : null },
          user.uid,
        )
      }
      resetForm()
    } catch (err) {
      setFormError(mapFirestoreError(err))
    } finally {
      setSubmitting(false)
    }
  }

  if (catalogLoading) {
    return <FullScreenStatus variant="loading" title="Cargando…" />
  }

  if (catalogError) {
    return (
      <FullScreenStatus
        variant="error"
        title="No se pudo cargar el catálogo"
        description="Ocurrió un problema al cargar los datos. Intenta de nuevo."
      />
    )
  }

  return (
    <div className="movements-page">
      <form className="catalog-panel" onSubmit={handleSubmit}>
        <h3>Registrar movimiento</h3>

        <div className="tabs movements-type-toggle" role="tablist" aria-label="Tipo de movimiento">
          <button
            type="button"
            role="tab"
            aria-selected={type === 'sale'}
            className={`tab${type === 'sale' ? ' tab-active' : ''}`}
            onClick={() => setType('sale')}
          >
            Venta
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={type === 'waste'}
            className={`tab${type === 'waste' ? ' tab-active' : ''}`}
            onClick={() => setType('waste')}
          >
            Merma
          </button>
        </div>

        <div className="field">
          <label htmlFor="movement-variant">Variante</label>
          <select
            id="movement-variant"
            required
            value={variantId}
            onChange={(e) => setVariantId(e.target.value)}
          >
            <option value="" disabled>
              Selecciona una variante
            </option>
            {groups.map((group) =>
              group.products.length === 0 ? null : (
                <optgroup key={group.category} label={CATEGORY_LABELS[group.category]}>
                  {group.products.flatMap(({ product, variants: productVariants }) =>
                    productVariants
                      .filter((variant) => variant.active)
                      .map((variant) => (
                        <option key={variant.id} value={variant.id}>
                          {variantLabel(product, variant)}
                        </option>
                      )),
                  )}
                </optgroup>
              ),
            )}
          </select>
        </div>

        <div className="field">
          <label htmlFor="movement-quantity">Cantidad</label>
          <input
            id="movement-quantity"
            type="number"
            min={1}
            step={1}
            required
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </div>

        {type === 'waste' && (
          <div className="field">
            <label htmlFor="movement-reason">Motivo (opcional)</label>
            <input
              id="movement-reason"
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej. producto caído, vencido, dañado"
            />
          </div>
        )}

        {formError && <p className="form-error">{formError}</p>}

        <div className="catalog-panel-actions">
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting
              ? 'Guardando…'
              : type === 'sale'
                ? 'Registrar venta'
                : 'Registrar merma'}
          </button>
        </div>
      </form>

      <section className="movements-history">
        <h3>Historial reciente</h3>

        {movementsError && (
          <p className="form-error">
            No se pudo cargar el historial de movimientos. Intenta de nuevo.
          </p>
        )}

        {movementsLoading && !movementsError ? (
          <p className="catalog-empty">Cargando historial…</p>
        ) : movements.length === 0 ? (
          <p className="catalog-empty">Todavía no hay movimientos registrados.</p>
        ) : (
          <ul className="movements-list">
            {movements.map((entry) => (
              <MovementRow
                key={`${entry.type}-${entry.id}`}
                entry={entry}
                variant={variantsById.get(entry.variantId)}
                product={
                  variantsById.get(entry.variantId)
                    ? productsById.get(variantsById.get(entry.variantId)!.productId)
                    : undefined
                }
                currentUid={user?.uid}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function variantLabel(product: Product, variant: Variant): string {
  return variant.flavor ? `${product.name} — ${variant.flavor}` : product.name
}

interface MovementRowProps {
  entry: MovementEntry
  variant: Variant | undefined
  product: Product | undefined
  currentUid: string | undefined
}

function MovementRow({ entry, variant, product, currentUid }: MovementRowProps) {
  const name = product && variant ? variantLabel(product, variant) : 'Variante eliminada'

  return (
    <li className="movements-row">
      <span className={`badge ${entry.type === 'sale' ? 'badge-sale' : 'badge-waste'}`}>
        {entry.type === 'sale' ? 'Venta' : 'Merma'}
      </span>
      <span className="movements-row-name">{name}</span>
      <span className="movements-row-quantity">{entry.quantity} u.</span>
      {entry.type === 'waste' && entry.reason && (
        <span className="movements-row-reason">{entry.reason}</span>
      )}
      <span className="movements-row-registered-by">{registeredByLabel(entry.registeredBy, currentUid)}</span>
      <span className="movements-row-meta">{formatTimestamp(entry.timestamp)}</span>
    </li>
  )
}

/**
 * `users/{uid}` is only readable by that same user (see `firestore.rules`),
 * so there's no client-side way to resolve another teammate's name from
 * their uid without a backend lookup. "Tú" for the signed-in user's own
 * entries, a shortened uid otherwise — good enough for an audit trail
 * without over-promising on a name we can't actually fetch.
 */
function registeredByLabel(registeredBy: string, currentUid: string | undefined): string {
  if (currentUid && registeredBy === currentUid) {
    return 'Tú'
  }
  return `Usuario ${registeredBy.slice(0, 6)}`
}

/** Firestore `Timestamp` -> locale date/time string. Falls back gracefully while `serverTimestamp()` is still pending on the writer's own optimistic snapshot. */
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
