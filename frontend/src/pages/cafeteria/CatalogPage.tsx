import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useCatalog } from '../../hooks/useCatalog'
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  groupCatalogByCategory,
  isLowStock,
  normalizeForSearch,
  type CatalogProductGroup,
} from '../../utils/catalog'
import { mapFirestoreError } from '../../utils/firestoreErrorMessages'
import {
  adjustVariantStock,
  checkVariantHasHistory,
  createProduct,
  createVariant,
  deleteVariant,
  updateProductCatalogFields,
  updateVariantCatalogFields,
  type Product,
  type ProductCategory,
  type Variant,
} from '../../services/firebase/catalog'
import { FullScreenStatus } from '../../components/FullScreenStatus'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { InfoTooltip } from '../../components/InfoTooltip'
import { useToast } from '../../hooks/useToast'
import { ProductForm, type ProductFormValues } from './components/ProductForm'
import {
  VariantForm,
  type VariantCatalogFormValues,
  type VariantDeleteState,
} from './components/VariantForm'
import '../../styles/forms.css'
import '../../styles/catalog.css'

/**
 * Local state machine for the "Zona de peligro" flow inside `VariantForm`'s
 * edit mode. Richer than `VariantDeleteState` (the prop `VariantForm`
 * actually reads) — `confirming`/`deleting` drive the `ConfirmDialog`
 * rendered by this page instead of anything inside the form itself; see
 * `toVariantDeleteState` below for how the two are reconciled.
 */
type DeleteFlow =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'blocked'; message: string }
  | { kind: 'confirming' }
  | { kind: 'deleting' }
  | { kind: 'failed'; message: string }

function toVariantDeleteState(flow: DeleteFlow): VariantDeleteState {
  switch (flow.kind) {
    case 'checking':
    case 'deleting':
      return { kind: 'checking' }
    case 'blocked':
      return { kind: 'blocked', message: flow.message }
    case 'failed':
      return { kind: 'failed', message: flow.message }
    default:
      return { kind: 'idle' }
  }
}

type EditTarget =
  | { kind: 'newProduct' }
  | { kind: 'editProduct'; product: Product }
  | { kind: 'newVariant'; productId: string }
  | { kind: 'editVariant'; variant: Variant }
  | null

/**
 * Cafetería's catalog CRUD screen: category-grouped product list, each
 * with its variants. Products are never hard-deleted (Firestore rules deny
 * it) — "eliminar" is `active: false`, reversible via the same Desactivar/
 * Reactivar action. Variants have that same reversible path AND a real
 * hard-delete for the zero-history case (see the "Zona de peligro" section
 * inside `VariantForm`'s edit mode, and `deleteFlow`/`handleRequestDelete`/
 * `handleConfirmDelete` below) — "Desactivar" itself is untouched by that
 * addition.
 */
export function CatalogPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const { products, variants, loading, error } = useCatalog()

  const [showInactive, setShowInactive] = useState(false)
  const [editTarget, setEditTarget] = useState<EditTarget>(null)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory | 'all'>('all')
  const [search, setSearch] = useState('')
  const [collapsedCategories, setCollapsedCategories] = useState<Set<ProductCategory>>(new Set())
  const [deleteFlow, setDeleteFlow] = useState<DeleteFlow>({ kind: 'idle' })

  const groups = useMemo(() => groupCatalogByCategory(products, variants), [products, variants])

  const normalizedSearch = normalizeForSearch(search)
  const isSearching = normalizedSearch.length > 0

  // Products filtered by active/search, independent of which category chip
  // is selected — this is what the chip counts and the "Todas" view use.
  const filteredGroups = useMemo(
    () =>
      groups.map((group) => ({
        ...group,
        products: group.products.filter(
          ({ product }) =>
            (showInactive || product.active) &&
            (!isSearching || normalizeForSearch(product.name).includes(normalizedSearch)),
        ),
      })),
    [groups, showInactive, isSearching, normalizedSearch],
  )

  const visibleGroups = useMemo(
    () =>
      selectedCategory === 'all'
        ? filteredGroups
        : filteredGroups.filter((group) => group.category === selectedCategory),
    [filteredGroups, selectedCategory],
  )

  const hasAnyVisibleProduct = visibleGroups.some((group) => group.products.length > 0)

  function setCategoryCollapsed(category: ProductCategory, isCollapsed: boolean) {
    setCollapsedCategories((current) => {
      const next = new Set(current)
      if (isCollapsed) {
        next.add(category)
      } else {
        next.delete(category)
      }
      return next
    })
  }

  function closeForm() {
    setEditTarget(null)
    setFormError(null)
    setDeleteFlow({ kind: 'idle' })
  }

  /**
   * Optimistic check → either block outright (skip a confirmation that's
   * certain to fail) or open `ConfirmDialog`. See
   * `services/firebase/catalog.ts`'s `checkVariantHasHistory` header for
   * why this is UX only, not the real authority.
   */
  async function handleRequestDelete(variant: Variant) {
    setDeleteFlow({ kind: 'checking' })
    try {
      const hasHistory = await checkVariantHasHistory(variant.id)
      if (hasHistory) {
        setDeleteFlow({
          kind: 'blocked',
          message:
            'Esta variante tiene historial (ventas, mermas o pedidos de reposición) — desactívala en vez de eliminarla.',
        })
        return
      }
      setDeleteFlow({ kind: 'confirming' })
    } catch (err) {
      setDeleteFlow({
        kind: 'failed',
        message: err instanceof Error ? err.message : 'No se pudo verificar el historial de la variante.',
      })
    }
  }

  async function handleConfirmDelete(variant: Variant) {
    setDeleteFlow({ kind: 'deleting' })
    try {
      await deleteVariant(variant.id)
      closeForm()
      showToast('success', 'Variante eliminada.')
    } catch (err) {
      // A race between the optimistic check and this click (e.g. a sale
      // got registered in between) — the callable re-validated everything
      // server-side and rejected it; show its message as-is, don't
      // silently swallow it.
      setDeleteFlow({
        kind: 'failed',
        message: err instanceof Error ? err.message : 'No se pudo eliminar la variante.',
      })
    }
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
    const nextActive = !product.active
    try {
      await updateProductCatalogFields(
        product.id,
        {
          name: product.name,
          description: product.description,
          category: product.category,
          active: nextActive,
        },
        user.uid,
      )
      showToast('success', nextActive ? 'Producto reactivado.' : 'Producto desactivado.')
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
    const nextActive = !variant.active
    try {
      await updateVariantCatalogFields(
        variant.id,
        { flavor: variant.flavor, minStockAlert: variant.minStockAlert, active: nextActive },
        user.uid,
      )
      showToast('success', nextActive ? 'Variante reactivada.' : 'Variante desactivada.')
    } catch (err) {
      setRowError(mapFirestoreError(err))
    }
  }

  async function handleAdjustStock(variant: Variant, nextStock: number) {
    if (!user) return
    setRowError(null)
    try {
      await adjustVariantStock(variant.id, nextStock, user.uid)
      showToast('success', `Stock actualizado a ${nextStock}.`)
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
      <div className="page-header">
        <div className="page-header-text">
          <p className="eyebrow">Cafetería</p>
          <h1>Catálogo</h1>
          <p>Productos, variantes y stock por categoría.</p>
        </div>
        <div className="page-header-actions">
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
      </div>

      <div className="catalog-toolbar">
        <div className="catalog-chips" role="tablist" aria-label="Filtrar por categoría">
          <button
            type="button"
            role="tab"
            aria-selected={selectedCategory === 'all'}
            className={`catalog-chip${selectedCategory === 'all' ? ' catalog-chip-active' : ''}`}
            onClick={() => setSelectedCategory('all')}
          >
            Todas
            <span className="catalog-chip-count">
              {filteredGroups.reduce((sum, group) => sum + group.products.length, 0)}
            </span>
          </button>
          {CATEGORY_ORDER.map((category) => {
            const count = filteredGroups.find((group) => group.category === category)?.products.length ?? 0
            return (
              <button
                key={category}
                type="button"
                role="tab"
                aria-selected={selectedCategory === category}
                className={`catalog-chip${selectedCategory === category ? ' catalog-chip-active' : ''}`}
                onClick={() => setSelectedCategory(category)}
              >
                {CATEGORY_LABELS[category]}
                <span className="catalog-chip-count">{count}</span>
              </button>
            )
          })}
        </div>

        <div className="field catalog-search">
          <label htmlFor="catalog-search" className="visually-hidden">
            Buscar producto por nombre
          </label>
          <input
            id="catalog-search"
            type="search"
            placeholder="Buscar producto…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {rowError && <p className="form-error">{rowError}</p>}

      {editTarget?.kind === 'editVariant' && (deleteFlow.kind === 'confirming' || deleteFlow.kind === 'deleting') && (
        <ConfirmDialog
          open
          title="¿Eliminar esta variante?"
          description="No se puede deshacer."
          confirmLabel={deleteFlow.kind === 'deleting' ? 'Eliminando…' : 'Eliminar'}
          danger
          busy={deleteFlow.kind === 'deleting'}
          onConfirm={() => handleConfirmDelete(editTarget.variant)}
          onCancel={() => setDeleteFlow({ kind: 'idle' })}
        />
      )}

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

      {isSearching && !hasAnyVisibleProduct && (
        <p className="catalog-empty">No se encontraron productos que coincidan con “{search}”.</p>
      )}

      {visibleGroups
        .filter((group) => !isSearching || group.products.length > 0)
        .map((group) => (
        <CategorySection
          key={group.category}
          category={group.category}
          products={group.products}
          showInactive={showInactive}
          collapsed={collapsedCategories.has(group.category) && !isSearching}
          onOpenChange={(open) => {
            // Forced open while searching (see `collapsed` above) — a click
            // during that state shouldn't overwrite the user's own saved
            // preference for when the search clears.
            if (isSearching) return
            setCategoryCollapsed(group.category, !open)
          }}
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
            setDeleteFlow({ kind: 'idle' })
          }}
          onUpdateVariant={handleUpdateVariant}
          onToggleVariantActive={handleToggleVariantActive}
          onAdjustStock={handleAdjustStock}
          onCancelForm={closeForm}
          deleteState={toVariantDeleteState(deleteFlow)}
          onRequestDelete={handleRequestDelete}
        />
      ))}
    </div>
  )
}

interface CategorySectionProps {
  category: ProductCategory
  products: CatalogProductGroup[]
  showInactive: boolean
  collapsed: boolean
  onOpenChange: (open: boolean) => void
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
  deleteState: VariantDeleteState
  onRequestDelete: (variant: Variant) => void
}

/**
 * `<details>`/`<summary>` accordion — native disclosure semantics (no
 * custom open/close JS beyond syncing the controlled `open` prop), so a
 * long category (e.g. Panadería's ~24 products) can be collapsed without
 * losing scroll position in the categories around it. Forced open by the
 * caller while a search is active, so results are never hidden behind a
 * collapsed section.
 */
function CategorySection({
  category,
  products,
  showInactive,
  collapsed,
  onOpenChange,
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
  deleteState,
  onRequestDelete,
}: CategorySectionProps) {
  const visibleProducts = products.filter((entry) => showInactive || entry.product.active)

  return (
    <details
      className="catalog-category"
      open={!collapsed}
      onToggle={(e) => onOpenChange(e.currentTarget.open)}
    >
      <summary className="catalog-category-header">
        <span className="catalog-category-chevron" aria-hidden="true" />
        <span className="catalog-category-title">{CATEGORY_LABELS[category]}</span>
        <span className="catalog-category-count">{visibleProducts.length}</span>
      </summary>

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
              deleteState={deleteState}
              onRequestDelete={onRequestDelete}
            />
          ))}
        </ul>
      )}
    </details>
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
  deleteState: VariantDeleteState
  onRequestDelete: (variant: Variant) => void
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
  deleteState,
  onRequestDelete,
}: ProductCardProps) {
  return (
    <li className={`catalog-product card${product.active ? '' : ' catalog-product-inactive'}`}>
      <div className="catalog-product-header">
        <div>
          <span className="catalog-product-name">{product.name}</span>
          {product.description?.trim() && <InfoTooltip text={product.description} />}
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
          deleteState={deleteState}
          onRequestDelete={() => onRequestDelete(editTarget.variant)}
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
  const [pendingStock, setPendingStock] = useState<number | null>(null)
  const low = isLowStock(variant)

  function step(delta: number) {
    const parsed = Number.parseInt(stockDraft, 10)
    const base = Number.isFinite(parsed) ? parsed : variant.stock
    setStockDraft(String(Math.max(0, base + delta)))
    setStockError(null)
  }

  function handleAdjustSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = Number.parseInt(stockDraft, 10)
    if (!Number.isFinite(parsed) || parsed < 0) {
      setStockError('El stock debe ser un número entero mayor o igual a 0.')
      return
    }
    setStockError(null)
    if (parsed === variant.stock) return
    setPendingStock(parsed)
  }

  function confirmPendingStock() {
    if (pendingStock === null) return
    onAdjustStock(pendingStock)
    setPendingStock(null)
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
        <div className="stock-stepper">
          <button
            type="button"
            className="stock-stepper-btn"
            aria-label="Restar una unidad"
            onClick={() => step(-1)}
            disabled={Number.parseInt(stockDraft, 10) <= 0}
          >
            −
          </button>
          <input
            id={`stock-${variant.id}`}
            className="stock-stepper-input"
            type="number"
            min={0}
            step={1}
            value={stockDraft}
            onChange={(e) => setStockDraft(e.target.value)}
            onWheel={(e) => e.currentTarget.blur()}
          />
          <button type="button" className="stock-stepper-btn" aria-label="Sumar una unidad" onClick={() => step(1)}>
            +
          </button>
        </div>
        <button type="submit" className="btn btn-secondary btn-small">
          Guardar
        </button>
      </form>
      {stockError && <p className="form-error">{stockError}</p>}

      <ConfirmDialog
        open={pendingStock !== null}
        title="Confirmar cambio de stock"
        description={
          pendingStock !== null
            ? `Vas a cambiar el stock de ${variant.stock} a ${pendingStock}.`
            : undefined
        }
        confirmLabel="Confirmar"
        onConfirm={confirmPendingStock}
        onCancel={() => {
          setPendingStock(null)
          setStockDraft(String(variant.stock))
        }}
      />
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
          onWheel={(e) => e.currentTarget.blur()}
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
    </form>
  )
}
