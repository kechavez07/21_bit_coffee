/**
 * Movements service — `sales` + `merma` (cafetería-owned audit records; see
 * `backend/firestore.rules` for the exact field/key constraints this module
 * encodes — read that file before changing anything here).
 *
 * The "golden rule" of this project (documented since the original plan):
 * every sale or waste entry must decrement the variant's stock in the SAME
 * atomic transaction that creates the audit record, so two simultaneous
 * registrations from different devices never step on each other. Both
 * `registerSale`/`registerWaste` are therefore `runTransaction()` calls, not
 * a plain `addDoc` + `updateDoc` pair.
 *
 * IMPORTANT — the stock decrement inside the transaction MUST send exactly
 * the same field set as `adjustVariantStock` in `catalog.ts`
 * (`stock`/`updatedAt`/`updatedBy`, nothing else) — the rules'
 * `isStockOnlyUpdate()` rejects anything wider.
 *
 * The "does this variant have enough stock" check is a CLIENT-side business
 * rule, done as a transactional read before any write. The rules' only
 * backstop is `stock >= 0` (see `isStockOnlyUpdate()`) — same trust model
 * already true for the manual stock adjustment in Phase 3.
 */
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  type FirestoreError,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from './config'

const SALES_COLLECTION = 'sales'
const MERMA_COLLECTION = 'merma'
const VARIANTS_COLLECTION = 'variants'

export interface SaleRecord {
  id: string
  variantId: string
  quantity: number
  registeredBy: string
  timestamp: unknown
}

export interface WasteRecord {
  id: string
  variantId: string
  quantity: number
  reason: string | null
  registeredBy: string
  timestamp: unknown
}

export interface RegisterSaleInput {
  variantId: string
  quantity: number
}

export interface RegisterWasteInput {
  variantId: string
  quantity: number
  reason?: string | null
}

/** Thrown by `registerSale`/`registerWaste` when the variant can't cover the requested quantity. Not a `FirestoreError` — callers map it with `mapFirestoreError`. */
export class InsufficientStockError extends Error {
  constructor() {
    super('insufficient-stock')
    this.name = 'InsufficientStockError'
  }
}

/**
 * Registers a sale: reads `variants/{variantId}` inside the transaction,
 * verifies it's `active` and has enough `stock`, then writes the `sales`
 * doc and decrements `variants/{variantId}.stock` — all or nothing.
 * Satisfies the `sales` rules' `create` constraints exactly (field set
 * below is intentionally the full allowed key list, no more).
 */
export async function registerSale(input: RegisterSaleInput, uid: string): Promise<void> {
  const variantRef = doc(db, VARIANTS_COLLECTION, input.variantId)
  const saleRef = doc(collection(db, SALES_COLLECTION))

  await runTransaction(db, async (transaction) => {
    const variantSnap = await transaction.get(variantRef)
    if (!variantSnap.exists()) {
      throw new Error('variant-not-found')
    }
    const variant = variantSnap.data()
    if (!variant.active) {
      throw new Error('variant-inactive')
    }
    if (typeof variant.stock !== 'number' || variant.stock < input.quantity) {
      throw new InsufficientStockError()
    }

    transaction.set(saleRef, {
      variantId: input.variantId,
      quantity: input.quantity,
      registeredBy: uid,
      timestamp: serverTimestamp(),
    })

    transaction.update(variantRef, {
      stock: variant.stock - input.quantity,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    })
  })
}

/**
 * Registers waste. Same transactional shape as `registerSale`, writing to
 * `merma` instead of `sales` — `reason` is only included in the payload
 * when provided, matching the rules' optional-field handling.
 */
export async function registerWaste(input: RegisterWasteInput, uid: string): Promise<void> {
  const variantRef = doc(db, VARIANTS_COLLECTION, input.variantId)
  const wasteRef = doc(collection(db, MERMA_COLLECTION))

  await runTransaction(db, async (transaction) => {
    const variantSnap = await transaction.get(variantRef)
    if (!variantSnap.exists()) {
      throw new Error('variant-not-found')
    }
    const variant = variantSnap.data()
    if (!variant.active) {
      throw new Error('variant-inactive')
    }
    if (typeof variant.stock !== 'number' || variant.stock < input.quantity) {
      throw new InsufficientStockError()
    }

    transaction.set(wasteRef, {
      variantId: input.variantId,
      quantity: input.quantity,
      registeredBy: uid,
      timestamp: serverTimestamp(),
      ...(input.reason ? { reason: input.reason } : {}),
    })

    transaction.update(variantRef, {
      stock: variant.stock - input.quantity,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    })
  })
}

/** Subscribes to the most recent `sales` docs, newest first. Single order field — no composite index needed. */
export function subscribeToSales(
  onNext: (sales: SaleRecord[]) => void,
  onError?: (error: FirestoreError) => void,
  limitCount = 50,
): Unsubscribe {
  const q = query(collection(db, SALES_COLLECTION), orderBy('timestamp', 'desc'), limit(limitCount))
  return onSnapshot(
    q,
    (snapshot) => {
      onNext(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }) as SaleRecord))
    },
    onError,
  )
}

/** Subscribes to the most recent `merma` docs, newest first. Same posture as `subscribeToSales`. */
export function subscribeToMerma(
  onNext: (merma: WasteRecord[]) => void,
  onError?: (error: FirestoreError) => void,
  limitCount = 50,
): Unsubscribe {
  const q = query(collection(db, MERMA_COLLECTION), orderBy('timestamp', 'desc'), limit(limitCount))
  return onSnapshot(
    q,
    (snapshot) => {
      onNext(
        snapshot.docs.map(
          (docSnap) => ({ id: docSnap.id, reason: null, ...docSnap.data() }) as WasteRecord,
        ),
      )
    },
    onError,
  )
}
