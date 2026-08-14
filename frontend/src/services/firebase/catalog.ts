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
 * "Delete" = soft delete (`active: false`) via the same update functions.
 * Firestore rules have `allow delete: if false` for both collections —
 * variants/products are referenced by sales/merma/restock_requests, so
 * there is no real delete path.
 */
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  type FirestoreError,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from './config'

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
