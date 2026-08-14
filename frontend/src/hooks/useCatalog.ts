/**
 * Subscribes to the whole catalog (`products` + `variants`) as one hook.
 *
 * Lives at the catalog level (not scoped to the Phase 3 screen) because
 * later phases (sale/waste variant picker, restock request builder) need
 * the exact same real-time data — this avoids every screen mounting its
 * own pair of listeners.
 *
 * `loading` stays `true` until *both* collections have delivered their
 * first snapshot. `error` is the first Firestore error from either
 * listener (whichever fires first) — good enough for a single "something
 * went wrong loading the catalog" banner.
 */
import { useEffect, useState } from 'react'
import type { FirestoreError } from 'firebase/firestore'
import {
  subscribeToProducts,
  subscribeToVariants,
  type Product,
  type Variant,
} from '../services/firebase/catalog'

export interface UseCatalogResult {
  products: Product[]
  variants: Variant[]
  loading: boolean
  error: Error | null
}

export function useCatalog(): UseCatalogResult {
  const [products, setProducts] = useState<Product[]>([])
  const [variants, setVariants] = useState<Variant[]>([])
  const [productsLoaded, setProductsLoaded] = useState(false)
  const [variantsLoaded, setVariantsLoaded] = useState(false)
  const [error, setError] = useState<FirestoreError | null>(null)

  useEffect(() => {
    const unsubscribeProducts = subscribeToProducts(
      (next) => {
        setProducts(next)
        setProductsLoaded(true)
      },
      (err) => setError((current) => current ?? err),
    )

    const unsubscribeVariants = subscribeToVariants(
      (next) => {
        setVariants(next)
        setVariantsLoaded(true)
      },
      (err) => setError((current) => current ?? err),
    )

    return () => {
      unsubscribeProducts()
      unsubscribeVariants()
    }
  }, [])

  return {
    products,
    variants,
    loading: !(productsLoaded && variantsLoaded),
    error,
  }
}
