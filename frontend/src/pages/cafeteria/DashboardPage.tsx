import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useCatalog } from '../../hooks/useCatalog'
import { isLowStock } from '../../utils/catalog'
import { FullScreenStatus } from '../../components/FullScreenStatus'
import '../../styles/catalog.css'

/**
 * Minimal Cafetería dashboard (not the real Phase 7 dashboard with
 * charts/history) — just enough so the "Dashboard" tab isn't empty:
 * total active products and which variants are at/under their low-stock
 * threshold. Built from the same `useCatalog` hook the catalog screen
 * uses, so this is effectively free once Phase 3's data layer exists.
 */
export function DashboardPage() {
  const { products, variants, loading, error } = useCatalog()

  const activeProducts = useMemo(() => products.filter((p) => p.active), [products])

  const lowStockVariants = useMemo(() => {
    const productsById = new Map(products.map((p) => [p.id, p]))
    return variants
      .filter((v) => v.active && isLowStock(v))
      .map((variant) => ({ variant, product: productsById.get(variant.productId) }))
      .sort((a, b) => (a.product?.name ?? '').localeCompare(b.product?.name ?? '', 'es'))
  }, [products, variants])

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
    <div className="dashboard-page">
      <div className="dashboard-cards">
        <div className="dashboard-card">
          <span className="dashboard-card-value">{activeProducts.length}</span>
          <span className="dashboard-card-label">Productos activos</span>
        </div>
        <div className="dashboard-card dashboard-card-warning">
          <span className="dashboard-card-value">{lowStockVariants.length}</span>
          <span className="dashboard-card-label">Variantes con stock bajo</span>
        </div>
      </div>

      <section>
        <h2>Stock bajo</h2>
        {lowStockVariants.length === 0 ? (
          <p>No hay variantes con stock bajo por ahora.</p>
        ) : (
          <ul className="low-stock-list">
            {lowStockVariants.map(({ variant, product }) => (
              <li key={variant.id}>
                <span className="low-stock-name">
                  {product?.name ?? 'Producto'}
                  {variant.flavor ? ` — ${variant.flavor}` : ''}
                </span>
                <span className="low-stock-count">
                  {variant.stock} / mín. {variant.minStockAlert}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p>
          <Link to="/cafeteria/catalogo">Ir al catálogo</Link>
        </p>
      </section>
    </div>
  )
}
