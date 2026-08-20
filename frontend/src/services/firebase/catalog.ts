/**
 * Catalog service — `products` + `variants` (cafetería-owned; see
 * `backend/firestore.rules` for the exact write constraints this module
 * encodes — read that file before changing anything here).
 *
 * Both collections are small (~100 docs total once the real catalog is
 * seeded), so each subscribe function is a single `onSnapshot` over the
 * whole collection — never one listener per document.
 *
 * IMPORTANT — `variants` writes MUST go through one of two mutually
 * exclusive functions, never a generic "update variant":
 *   - `updateVariantCatalogFields` sends ONLY flavor/minStockAlert/active
 *     (+ updatedAt/updatedBy). It must NEVER include `stock` — the rules'
 *     `isCatalogFieldUpdate()` explicitly rejects a diff that touches it.
 *   - `adjustVariantStock` sends ONLY stock (+ updatedAt/updatedBy).
 *     `isStockOnlyUpdate()` rejects anything else in the diff.
 * Mixing the two field sets in one write is rejected by Firestore, full
 * stop — this isn't a style preference, it's how the rules are shaped.
 *
 * "Desactivar" = soft delete (`active: false`) via the same update
 * functions. Firestore rules have `allow delete: if false` for both
 * `products` and `variants` unconditionally — a variant/product can be
 * referenced by `sales`/`merma`/`restock_requests`, so a direct client
 * delete can never be verified safe from a security rule alone.
 *
 * A real hard delete DOES exist for variants with zero history, but it
 * deliberately does not go through this module's usual `updateDoc`/
 * `addDoc` pattern — `deleteVariant` below calls the Express server
 * (`backend/server/src/lib/catalog.js`, see `./apiClient.ts`) which runs
 * the cross-collection history check server-side with the Admin SDK and
 * only then performs the real `.delete()`. `checkVariantHasHistory` is a
 * client-side *optimistic* mirror of that same check, used only to skip a
 * confirmation dialog that's certain to fail — the server re-validates
 * everything itself and is the only source of truth.
 */
import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type FirestoreError,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from './config'
import { callApi } from './apiClient'

export type ProductCategory = 'galletas' | 'panaderia' | 'reposteria'

export interface Product {
  id: string
  name: string
  description: string | null
  category: ProductCategory
  active: boolean
  createdAt: unknown
  createdBy: string
  updatedAt: unknown
  updatedBy: string
}

export interface Variant {
  id: string
  productId: string
  flavor: string | null
  stock: number
  minStockAlert: number
  active: boolean
  createdAt: unknown
  createdBy: string
  updatedAt: unknown
  updatedBy: string
}

const PRODUCTS_COLLECTION = 'products'
const VARIANTS_COLLECTION = 'variants'
const SALES_COLLECTION = 'sales'
const MERMA_COLLECTION = 'merma'
const REQUESTS_COLLECTION = 'restock_requests'

/**
 * Subscribes to every `products` doc (no `active` filter — the UI decides
 * what to show, see `frontend/src/pages/cafeteria/CatalogPage.tsx`).
 * Sorting/grouping is the caller's job (see `utils/catalog.ts`).
 */
export function subscribeToProducts(
  onNext: (products: Product[]) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  return onSnapshot(
    collection(db, PRODUCTS_COLLECTION),
    (snapshot) => {
      onNext(
        snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }) as Product),
      )
    },
    onError,
  )
}

/** Subscribes to every `variants` doc. Same no-filter/no-order posture as `subscribeToProducts`. */
export function subscribeToVariants(
  onNext: (variants: Variant[]) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  return onSnapshot(
    collection(db, VARIANTS_COLLECTION),
    (snapshot) => {
      onNext(
        snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }) as Variant),
      )
    },
    onError,
  )
}

export interface CreateProductInput {
  name: string
  description: string | null
  category: ProductCategory
}

/** Creates a product. Satisfies `isValidProductCreate()`. */
export async function createProduct(input: CreateProductInput, uid: string): Promise<string> {
  const ref = await addDoc(collection(db, PRODUCTS_COLLECTION), {
    name: input.name,
    description: input.description,
    category: input.category,
    active: true,
    createdAt: serverTimestamp(),
    createdBy: uid,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  })
  return ref.id
}

export interface UpdateProductCatalogFieldsInput {
  name: string
  description: string | null
  category: ProductCategory
  active: boolean
}

/**
 * Updates a product's catalog fields (including the active/soft-delete
 * flag). Deliberately never includes `createdAt`/`createdBy` in the
 * payload — `isValidProductUpdate()` requires those to stay byte-for-byte
 * equal to what's already stored, and simply omitting them from an
 * `updateDoc()` call is the easiest way to guarantee that.
 */
export async function updateProductCatalogFields(
  id: string,
  input: UpdateProductCatalogFieldsInput,
  uid: string,
): Promise<void> {
  await updateDoc(doc(db, PRODUCTS_COLLECTION, id), {
    name: input.name,
    description: input.description,
    category: input.category,
    active: input.active,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  })
}

export interface CreateVariantInput {
  productId: string
  flavor: string | null
  stock: number
  minStockAlert: number
}

/** Creates a variant. Satisfies `isValidVariantCreate()`. */
export async function createVariant(input: CreateVariantInput, uid: string): Promise<string> {
  const ref = await addDoc(collection(db, VARIANTS_COLLECTION), {
    productId: input.productId,
    flavor: input.flavor,
    stock: input.stock,
    minStockAlert: input.minStockAlert,
    active: true,
    createdAt: serverTimestamp(),
    createdBy: uid,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  })
  return ref.id
}

export interface UpdateVariantCatalogFieldsInput {
  flavor: string | null
  minStockAlert: number
  active: boolean
}

/**
 * Updates a variant's catalog fields (including active/soft-delete).
 * Payload is ONLY flavor/minStockAlert/active (+ updatedAt/updatedBy) —
 * `stock` is never part of this call. Satisfies `isCatalogFieldUpdate()`.
 */
export async function updateVariantCatalogFields(
  id: string,
  input: UpdateVariantCatalogFieldsInput,
  uid: string,
): Promise<void> {
  await updateDoc(doc(db, VARIANTS_COLLECTION, id), {
    flavor: input.flavor,
    minStockAlert: input.minStockAlert,
    active: input.active,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  })
}

/**
 * Adjusts a variant's stock directly (typo correction on the initial
 * count — NOT the sale/waste flow, which lands in a later phase). Payload
 * is ONLY stock (+ updatedAt/updatedBy). Satisfies `isStockOnlyUpdate()`.
 */
export async function adjustVariantStock(id: string, stock: number, uid: string): Promise<void> {
  await updateDoc(doc(db, VARIANTS_COLLECTION, id), {
    stock,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  })
}

/**
 * Client-side optimistic mirror of the check `deleteVariant` (the Cloud
 * Function) performs server-side: does this variant show up in `sales`,
 * `merma`, or any `restock_requests.items[]`?
 *
 * `restock_requests` is readable by any signed-in user, per
 * `backend/firestore.rules`. `sales`/`merma`, however, currently have NO
 * client rule at all — they fall through to the collection's deny-all
 * fallback (see the rules file's own H-02 note: those two collections'
 * rules are tracked separately and are deliberately out of scope for the
 * pass that added `products`/`variants`/`restock_requests` rules).
 * Confirmed empirically against the emulator: a query against either
 * throws `permission-denied` for every signed-in user, cafetería included.
 * Each of the two queries below is therefore wrapped to swallow exactly
 * that error and treat it as "inconclusive" rather than letting it reject
 * the whole check — this function is explicitly UX-only (skip opening a
 * confirmation dialog that's certain to be rejected), NOT the authority on
 * whether the delete will succeed, so degrading gracefully here instead of
 * throwing is consistent with that: the callable still runs the real
 * `sales`/`merma` check itself with the Admin SDK (which always bypasses
 * rules) and is the only source of truth, same as any other race between
 * this check and the confirm click.
 */
export async function checkVariantHasHistory(variantId: string): Promise<boolean> {
  const [salesSnap, mermaSnap] = await Promise.all([
    queryHistoryCollection(SALES_COLLECTION, variantId),
    queryHistoryCollection(MERMA_COLLECTION, variantId),
  ])
  if (salesSnap === true || mermaSnap === true) {
    return true
  }

  // Same posture as the callable: no index-friendly way to query inside
  // `items[]` for an exact `variantId` match, so read the whole (low
  // volume) collection and check in memory.
  const requestsSnap = await getDocs(collection(db, REQUESTS_COLLECTION))
  return requestsSnap.docs.some((docSnap) => {
    const items = docSnap.data().items
    return Array.isArray(items) && items.some((item) => item?.variantId === variantId)
  })
}

/**
 * `true` if `collectionName` has a doc referencing `variantId`, `false` if
 * not — or if the read itself was denied (see this function's only
 * caller's header comment for why that's swallowed rather than thrown).
 */
async function queryHistoryCollection(collectionName: string, variantId: string): Promise<boolean> {
  try {
    const snap = await getDocs(
      query(collection(db, collectionName), where('variantId', '==', variantId), limit(1)),
    )
    return !snap.empty
  } catch (err) {
    if (isPermissionDenied(err)) {
      return false
    }
    throw err
  }
}

function isPermissionDenied(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 'permission-denied'
}

/**
 * Hard-deletes a variant with zero history. Calls the Express server's
 * `deleteVariant` route (`backend/server/src/lib/catalog.js`) via
 * `callApi` — errors come back with a Spanish `.message` meant to be shown
 * as-is, same posture as `services/firebase/restockRequests.ts`'s callers
 * (no parallel error-mapping table here either).
 */
export async function deleteVariant(variantId: string): Promise<void> {
  await callApi<{ deleted: boolean }>('deleteVariant', { variantId })
}
