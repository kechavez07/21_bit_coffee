/**
 * Pure catalog helpers — no React, no Firestore. Kept framework-free on
 * purpose so `testing-qa` can unit-test grouping/low-stock logic directly
 * without mounting any component.
 */
import type { Product, ProductCategory, Variant } from '../services/firebase/catalog'

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  galletas: 'Galletas',
  panaderia: 'Panadería',
  reposteria: 'Repostería',
}

/** Fixed display order for categories — not alphabetical, matches the client's own list order. */
export const CATEGORY_ORDER: ProductCategory[] = ['galletas', 'panaderia', 'reposteria']

export interface CatalogProductGroup {
  product: Product
  variants: Variant[]
}

export interface CatalogCategoryGroup {
  category: ProductCategory
  products: CatalogProductGroup[]
}

/**
 * Groups `products` by category (fixed `CATEGORY_ORDER`) and attaches each
 * product's own `variants`, alphabetically sorted within each level.
 * Does not filter by `active` — callers decide what to hide (e.g. the
 * "Mostrar inactivos" toggle in `CatalogPage`).
 */
export function groupCatalogByCategory(
  products: Product[],
  variants: Variant[],
): CatalogCategoryGroup[] {
  const variantsByProduct = new Map<string, Variant[]>()
  for (const variant of variants) {
    const existing = variantsByProduct.get(variant.productId)
    if (existing) {
      existing.push(variant)
    } else {
      variantsByProduct.set(variant.productId, [variant])
    }
  }
  for (const list of variantsByProduct.values()) {
    list.sort((a, b) => (a.flavor ?? '').localeCompare(b.flavor ?? '', 'es'))
  }

  return CATEGORY_ORDER.map((category) => ({
    category,
    products: products
      .filter((product) => product.category === category)
      .sort((a, b) => a.name.localeCompare(b.name, 'es'))
      .map((product) => ({
        product,
        variants: variantsByProduct.get(product.id) ?? [],
      })),
  }))
}

/** A variant is low on stock once it's at or below its own alert threshold. */
export function isLowStock(variant: Variant): boolean {
  return variant.stock <= variant.minStockAlert
}
