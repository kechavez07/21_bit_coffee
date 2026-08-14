import { useMemo } from 'react'
import { useCatalog } from '../../hooks/useCatalog'
import { CATEGORY_LABELS, groupCatalogByCategory, isLowStock } from '../../utils/catalog'
import { FullScreenStatus } from '../../components/FullScreenStatus'
import '../../styles/catalog.css'

/**
 * Pastelería's read-only view of cafetería's stock — same `useCatalog` +
 * `groupCatalogByCategory` data layer as `CatalogPage`, but with zero write
 * controls: production has no write path to the catalog at all (rules
 * already enforce this; this screen just never offers the buttons).
 */
export function DashboardPage() {
  const { products, variants, loading, error } = useCatalog()

  const groups = useMemo(() => groupCatalogByCategory(products, variants), [products, variants])

  if (loading) {
    return <FullScreenStatus variant="loading" title="Cargando…" />
  }

  if (error) {
    return (
      <FullScreenStatus
        variant="error"
        title="No se pudo cargar el stock"
        description="Ocurrió un problema al cargar los datos. Intenta de nuevo."
      />
    )
  }

  return (
    <div className="catalog-page">
      <h2>Stock de cafetería</h2>
      <p className="catalog-empty">Vista de solo lectura — pastelería no edita el catálogo.</p>

      {groups.map((group) => {
        const activeProducts = group.products.filter((entry) => entry.product.active)
        return (
          <section key={group.category} className="catalog-category">
            <h2>{CATEGORY_LABELS[group.category]}</h2>
            {activeProducts.length === 0 ? (
              <p className="catalog-empty">No hay productos en {CATEGORY_LABELS[group.category]} todavía.</p>
            ) : (
              <ul className="catalog-product-list">
                {activeProducts.map(({ product, variants: productVariants }) => {
                  const activeVariants = productVariants.filter((variant) => variant.active)
                  return (
                    <li key={product.id} className="catalog-product">
                      <div className="catalog-product-header">
                        <span className="catalog-product-name">{product.name}</span>
                      </div>

                      {activeVariants.length === 0 ? (
                        <p className="catalog-empty catalog-empty-variants">Sin variantes activas.</p>
                      ) : (
                        <ul className="catalog-variant-list">
                          {activeVariants.map((variant) => {
                            const low = isLowStock(variant)
                            return (
                              <li
                                key={variant.id}
                                className={`catalog-variant${low ? ' catalog-variant-low' : ''}`}
                              >
                                <div className="catalog-variant-info">
                                  <span className="catalog-variant-flavor">
                                    {variant.flavor ?? 'Sin sabor'}
                                  </span>
                                  <span className="catalog-variant-stock">
                                    Stock: {variant.stock} {low && <span className="badge badge-low">Bajo</span>}
                                  </span>
                                  <span className="catalog-variant-min">mín. {variant.minStockAlert}</span>
                                </div>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}
