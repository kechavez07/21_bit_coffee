import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useCatalog } from '../../hooks/useCatalog'
import {
  CATEGORY_LABELS,
  groupCatalogByCategory,
  isLowStock,
  type CatalogProductGroup,
} from '../../utils/catalog'
import { mapFirestoreError } from '../../utils/firestoreErrorMessages'
import {
  adjustVariantStock,
  createProduct,
  createVariant,
  updateProductCatalogFields,
  updateVariantCatalogFields,
  type Product,
  type ProductCategory,
  type Variant,
} from '../../services/firebase/catalog'
import { FullScreenStatus } from '../../components/FullScreenStatus'
import { ProductForm, type ProductFormValues } from './components/ProductForm'
import { VariantForm, type VariantCatalogFormValues } from './components/VariantForm'
import '../../styles/forms.css'
import '../../styles/catalog.css'

type EditTarget =
  | { kind: 'newProduct' }
  | { kind: 'editProduct'; product: Product }
  | { kind: 'newVariant'; productId: string }
  | { kind: 'editVariant'; variant: Variant }
  | null

/**
 * Cafetería's catalog CRUD screen: category-grouped product list, each
 * with its variants. Products/variants are never hard-deleted (Firestore
 * rules deny it) — "eliminar" is `active: false`, reversible via the same
 * Desactivar/Reactivar action.
 */
export function CatalogPage() {
  const { user } = useAuth()
  const { products, variants, loading, error } = useCatalog()

  const [showInactive, setShowInactive] = useState(false)
  const [editTarget, setEditTarget] = useState<EditTarget>(null)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)

  const groups = useMemo(() => groupCatalogByCategory(products, variants), [products, variants])

  function closeForm() {
    setEditTarget(null)
    setFormError(null)
  }

  async function handleCreateProduct(values: ProductFormValues) {
    if (!user) return
    setSubmitting(true)
    setFormError(null)
    try {
      await createProduct(values, user.uid)
      closeForm()
    } catch (err) {
      setFormError(mapFirestoreError(err))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleUpdateProduct(product: Product, values: ProductFormValues) {
    if (!user) return
    setSubmitting(true)
    setFormError(null)
    try {
      await updateProductCatalogFields(product.id, { ...values, active: product.active }, user.uid)
      closeForm()
    } catch (err) {
      setFormError(mapFirestoreError(err))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleToggleProductActive(product: Product) {
    if (!user) return
    setRowError(null)
    try {
      await updateProductCatalogFields(
        product.id,
        {
          name: product.name,
          description: product.description,
          category: product.category,
          active: !product.active,
        },
        user.uid,
      )
    } catch (err) {
      setRowError(mapFirestoreError(err))
    }
  }

  async function handleCreateVariant(productId: string, values: NewVariantFormValues) {
    if (!user) return
    setSubmitting(true)
    setFormError(null)
    try {
      await createVariant(
        { productId, flavor: values.flavor, stock: values.stock, minStockAlert: values.minStockAlert },
        user.uid,
      )
      closeForm()
    } catch (err) {
      setFormError(mapFirestoreError(err))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleUpdateVariant(variant: Variant, values: VariantCatalogFormValues) {
    if (!user) return
    setSubmitting(true)
    setFormError(null)
    try {
      await updateVariantCatalogFields(variant.id, { ...values, active: variant.active }, user.uid)
      closeForm()
    } catch (err) {
      setFormError(mapFirestoreError(err))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleToggleVariantActive(variant: Variant) {
    if (!user) return
    setRowError(null)
    try {
      await updateVariantCatalogFields(
        variant.id,
        { flavor: variant.flavor, minStockAlert: variant.minStockAlert, active: !variant.active },
        user.uid,
      )
    } catch (err) {
      setRowError(mapFirestoreError(err))
    }
  }

  async function handleAdjustStock(variant: Variant, nextStock: number) {
    if (!user) return
    setRowError(null)
    try {
      await adjustVariantStock(variant.id, nextStock, user.uid)
    } catch (err) {
      setRowError(mapFirestoreError(err))
    }
  }

  if (loading) {
    return <FullScreenStatus variant="loading" title="Cargando…" />
  }

  if (error) {
    return (
      <FullScreenStatus
        variant="error"
        title="No se pudo cargar el catálogo"
        description="Ocurrió un problema al cargar los datos. Intenta de nuevo."
      />
    )
  }

  return (
    <div className="catalog-page">
      <div className="catalog-toolbar">
        <label className="catalog-toggle">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Mostrar inactivos
        </label>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setEditTarget({ kind: 'newProduct' })
            setFormError(null)
          }}
        >
          + Nuevo producto
        </button>
      </div>

      {rowError && <p className="form-error">{rowError}</p>}

      {editTarget?.kind === 'newProduct' && (
        <ProductForm
          title="Nuevo producto"
          submitting={submitting}
          error={formError}
          onSubmit={handleCreateProduct}
          onCancel={closeForm}
        />
      )}

      {editTarget?.kind === 'editProduct' && (
        <ProductForm
          title={`Editar ${editTarget.product.name}`}
          initial={{
            name: editTarget.product.name,
            description: editTarget.product.description,
            category: editTarget.product.category,
          }}
          submitting={submitting}
          error={formError}
          onSubmit={(values) => handleUpdateProduct(editTarget.product, values)}
          onCancel={closeForm}
        />
      )}

      {groups.map((group) => (
        <CategorySection
          key={group.category}
          category={group.category}
          products={group.products}
          showInactive={showInactive}
          editTarget={editTarget}
          submitting={submitting}
          formError={formError}
          onEditProduct={(product) => {
            setEditTarget({ kind: 'editProduct', product })
            setFormError(null)
          }}
          onToggleProductActive={handleToggleProductActive}
          onAddVariant={(productId) => {
            setEditTarget({ kind: 'newVariant', productId })
            setFormError(null)
          }}
          onCreateVariant={handleCreateVariant}
          onEditVariant={(variant) => {
            setEditTarget({ kind: 'editVariant', variant })
            setFormError(null)
          }}
          onUpdateVariant={handleUpdateVariant}
          onToggleVariantActive={handleToggleVariantActive}
          onAdjustStock={handleAdjustStock}
          onCancelForm={closeForm}
        />
      ))}
    </div>
  )
}

interface CategorySectionProps {
  category: ProductCategory
  products: CatalogProductGroup[]
  showInactive: boolean
  editTarget: EditTarget
  submitting: boolean
  formError: string | null
  onEditProduct: (product: Product) => void
  onToggleProductActive: (product: Product) => void
  onAddVariant: (productId: string) => void
  onCreateVariant: (productId: string, values: NewVariantFormValues) => void
  onEditVariant: (variant: Variant) => void
  onUpdateVariant: (variant: Variant, values: VariantCatalogFormValues) => void
  onToggleVariantActive: (variant: Variant) => void
  onAdjustStock: (variant: Variant, nextStock: number) => void
  onCancelForm: () => void
}

function CategorySection({
  category,
  products,
  showInactive,
  editTarget,
  submitting,
  formError,
  onEditProduct,
  onToggleProductActive,
  onAddVariant,
  onCreateVariant,
  onEditVariant,
  onUpdateVariant,
  onToggleVariantActive,
  onAdjustStock,
  onCancelForm,
}: CategorySectionProps) {
  const visibleProducts = products.filter((entry) => showInactive || entry.product.active)

  return (
    <section className="catalog-category">
      <h2>{CATEGORY_LABELS[category]}</h2>

      {visibleProducts.length === 0 ? (
        <p className="catalog-empty">No hay productos en {CATEGORY_LABELS[category]} todavía.</p>
      ) : (
        <ul className="catalog-product-list">
          {visibleProducts.map(({ product, variants }) => (
            <ProductCard
              key={product.id}
              product={product}
              variants={variants.filter((v) => showInactive || v.active)}
              editTarget={editTarget}
              submitting={submitting}
              formError={formError}
              onEditProduct={onEditProduct}
              onToggleProductActive={onToggleProductActive}
              onAddVariant={onAddVariant}
              onCreateVariant={onCreateVariant}
              onEditVariant={onEditVariant}
              onUpdateVariant={onUpdateVariant}
              onToggleVariantActive={onToggleVariantActive}
              onAdjustStock={onAdjustStock}
              onCancelForm={onCancelForm}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

interface ProductCardProps {
  product: Product
  variants: Variant[]
  editTarget: EditTarget
  submitting: boolean
  formError: string | null
  onEditProduct: (product: Product) => void
  onToggleProductActive: (product: Product) => void
  onAddVariant: (productId: string) => void
  onCreateVariant: (productId: string, values: NewVariantFormValues) => void
  onEditVariant: (variant: Variant) => void
  onUpdateVariant: (variant: Variant, values: VariantCatalogFormValues) => void
  onToggleVariantActive: (variant: Variant) => void
  onAdjustStock: (variant: Variant, nextStock: number) => void
  onCancelForm: () => void
}

function ProductCard({
  product,
  variants,
  editTarget,
  submitting,
  formError,
  onEditProduct,
  onToggleProductActive,
  onAddVariant,
  onCreateVariant,
  onEditVariant,
  onUpdateVariant,
  onToggleVariantActive,
  onAdjustStock,
  onCancelForm,
}: ProductCardProps) {
  return (
    <li className={`catalog-product${product.active ? '' : ' catalog-product-inactive'}`}>
      <div className="catalog-product-header">
        <div>
          <span className="catalog-product-name">{product.name}</span>
          {!product.active && <span className="badge badge-inactive">Inactivo</span>}
        </div>
        <div className="catalog-product-actions">
          <button type="button" className="btn btn-secondary btn-small" onClick={() => onEditProduct(product)}>
            Editar
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-small"
            onClick={() => onToggleProductActive(product)}
          >
            {product.active ? 'Desactivar' : 'Reactivar'}
          </button>
        </div>
      </div>

      {editTarget?.kind === 'editVariant' && editTarget.variant.productId === product.id && (
        <VariantForm
          title={`Editar variante — ${editTarget.variant.flavor ?? 'sin sabor'}`}
          initial={{ flavor: editTarget.variant.flavor, minStockAlert: editTarget.variant.minStockAlert }}
          submitting={submitting}
          error={formError}
          onSubmit={(values) => onUpdateVariant(editTarget.variant, values)}
          onCancel={onCancelForm}
        />
      )}

      {variants.length === 0 ? (
        <p className="catalog-empty catalog-empty-variants">Sin variantes todavía.</p>
      ) : (
        <ul className="catalog-variant-list">
          {variants.map((variant) => (
            <VariantRow
              key={variant.id}
              variant={variant}
              onEdit={() => onEditVariant(variant)}
              onToggleActive={() => onToggleVariantActive(variant)}
              onAdjustStock={(next) => onAdjustStock(variant, next)}
            />
          ))}
        </ul>
      )}

      {editTarget?.kind === 'newVariant' && editTarget.productId === product.id ? (
        <NewVariantForm
          submitting={submitting}
          error={formError}
          onSubmit={(values) => onCreateVariant(product.id, values)}
          onCancel={onCancelForm}
        />
      ) : (
        <button
          type="button"
          className="btn btn-secondary btn-small"
          onClick={() => onAddVariant(product.id)}
        >
          + Nueva variante
        </button>
      )}
    </li>
  )
}

interface VariantRowProps {
  variant: Variant
  onEdit: () => void
  onToggleActive: () => void
  onAdjustStock: (nextStock: number) => void
}

function VariantRow({ variant, onEdit, onToggleActive, onAdjustStock }: VariantRowProps) {
  const [stockDraft, setStockDraft] = useState(String(variant.stock))
  const [stockError, setStockError] = useState<string | null>(null)
  const low = isLowStock(variant)

  function handleAdjustSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = Number.parseInt(stockDraft, 10)
    if (!Number.isFinite(parsed) || parsed < 0) {
      setStockError('El stock debe ser un número entero mayor o igual a 0.')
      return
    }
    setStockError(null)
    onAdjustStock(parsed)
  }

  return (
    <li className={`catalog-variant${variant.active ? '' : ' catalog-variant-inactive'}${low ? ' catalog-variant-low' : ''}`}>
      <div className="catalog-variant-info">
        <span className="catalog-variant-flavor">{variant.flavor ?? 'Sin sabor'}</span>
        <span className="catalog-variant-stock">
          Stock: {variant.stock} {low && <span className="badge badge-low">Bajo</span>}
        </span>
        <span className="catalog-variant-min">mín. {variant.minStockAlert}</span>
        {!variant.active && <span className="badge badge-inactive">Inactivo</span>}
      </div>

      <div className="catalog-variant-actions">
        <button type="button" className="btn btn-secondary btn-small" onClick={onEdit}>
          Editar
        </button>
        <button type="button" className="btn btn-secondary btn-small" onClick={onToggleActive}>
          {variant.active ? 'Desactivar' : 'Reactivar'}
        </button>
      </div>

      <form className="catalog-stock-adjust" onSubmit={handleAdjustSubmit}>
        <label htmlFor={`stock-${variant.id}`}>Ajustar stock</label>
        <input
          id={`stock-${variant.id}`}
          type="number"
          min={0}
          step={1}
          value={stockDraft}
          onChange={(e) => setStockDraft(e.target.value)}
        />
        <button type="submit" className="btn btn-secondary btn-small">
          Guardar
        </button>
      </form>
      {stockError && <p className="form-error">{stockError}</p>}
    </li>
  )
}

interface NewVariantFormValues {
  flavor: string | null
  stock: number
  minStockAlert: number
}

interface NewVariantFormProps {
  submitting: boolean
  error: string | null
  onSubmit: (values: NewVariantFormValues) => void
  onCancel: () => void
}

/**
 * Variant *creation* form. Unlike `VariantForm` (catalog-field edits
 * only), this one includes `stock` — a brand-new variant needs an initial
 * count and `isValidVariantCreate()` requires it in the same write as
 * flavor/minStockAlert. This is a single atomic create, not the
 * catalog-vs-stock split that applies to *updates*.
 */
function NewVariantForm({ submitting, error, onSubmit, onCancel }: NewVariantFormProps) {
  const [flavor, setFlavor] = useState('')
  const [stock, setStock] = useState('0')
  const [minStockAlert, setMinStockAlert] = useState('0')
  const [localError, setLocalError] = useState<string | null>(null)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLocalError(null)

    const parsedStock = Number.parseInt(stock, 10)
    const parsedMin = Number.parseInt(minStockAlert, 10)
    if (!Number.isFinite(parsedStock) || parsedStock < 0) {
      setLocalError('El stock inicial debe ser un número entero mayor o igual a 0.')
      return
    }
    if (!Number.isFinite(parsedMin) || parsedMin < 0) {
      setLocalError('El stock mínimo debe ser un número entero mayor o igual a 0.')
      return
    }

    onSubmit({
      flavor: flavor.trim() ? flavor.trim() : null,
      stock: parsedStock,
      minStockAlert: parsedMin,
    })
  }

  return (
    <form className="catalog-panel" onSubmit={handleSubmit}>
      <h4>Nueva variante</h4>

      <div className="field">
        <label htmlFor="new-variant-flavor">Sabor (opcional)</label>
        <input
          id="new-variant-flavor"
          type="text"
          value={flavor}
          onChange={(e) => setFlavor(e.target.value)}
          placeholder="Dejar vacío si el producto no tiene sabores"
        />
      </div>

      <div className="field">
        <label htmlFor="new-variant-stock">Stock inicial</label>
        <input
          id="new-variant-stock"
          type="number"
          min={0}
          step={1}
          required
          value={stock}
          onChange={(e) => setStock(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="new-variant-min">Stock mínimo (alerta)</label>
        <input
          id="new-variant-min"
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
