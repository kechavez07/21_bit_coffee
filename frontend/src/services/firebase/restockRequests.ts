/**
 * Restock-requests service — `restock_requests` (root doc, read-only for
 * clients — every mutation is one of the six routes below) and its
 * `comments` subcollection (plain client writes, allowed by
 * `backend/firestore.rules`).
 *
 * See `backend/server/src/lib/restockRequests.js` for the state machine this
 * module drives:
 *
 *   pending --accept--> queued --dispatch--> dispatched --confirmReceipt--> received
 *      |
 *      +--edit (cafetería, while still pending)
 *      +--reject (pastelería) --> rejected  [terminal]
 *
 * The six routes used to be Cloud Functions callables (`httpsCallable`);
 * they're now plain HTTP POSTs to the Express server at `VITE_API_URL`
 * (see `README_MIGRACION.md`). `callApi` below deliberately does NOT map
 * the response to a friendlier message the way `mapFirestoreError` does for
 * Firestore write failures — the server's error responses already carry a
 * Spanish message meant to be shown to the user as-is (see
 * `backend/server/src/lib/validation.js`). Callers just read `error.message`,
 * same as before with `FunctionsError`.
 */
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  type FirestoreError,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from './config'
import { callApi } from './apiClient'
import type { UserRole } from './auth'

const REQUESTS_COLLECTION = 'restock_requests'

export type RestockRequestStatus = 'pending' | 'queued' | 'rejected' | 'dispatched' | 'received'

export interface RestockRequestItem {
  variantId: string
  productId: string
  productName: string
  flavor: string | null
  currentStockAtRequest: number
  requestedQty: number
  dispatchedQty?: number
  dispatchNote?: string | null
}

export interface RestockRequest {
  id: string
  requestedBy: string
  status: RestockRequestStatus
  items: RestockRequestItem[]
  createdAt: unknown
  updatedAt: unknown
  acceptedAt?: unknown
  acceptedBy?: string
  rejectedAt?: unknown
  rejectedBy?: string
  rejectionReason?: string
  dispatchedAt?: unknown
  dispatchedBy?: string
  receivedAt?: unknown
  receivedBy?: string
}

export interface RestockComment {
  id: string
  authorUid: string
  authorRole: UserRole
  text: string
  createdAt: unknown
}

/**
 * Subscribes to the entire `restock_requests` history, newest first.
 * No status filter (dataset is small — decades of requests, not
 * thousands) — screens filter/group client-side, same posture as
 * `useCatalog`/`useMovements`.
 */
export function subscribeToRestockRequests(
  onNext: (requests: RestockRequest[]) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  const q = query(collection(db, REQUESTS_COLLECTION), orderBy('createdAt', 'desc'))
  return onSnapshot(
    q,
    (snapshot) => {
      onNext(
        snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }) as RestockRequest),
      )
    },
    onError,
  )
}

/**
 * Subscribes to a single request's `comments` subcollection, oldest first
 * (a thread reads chronologically, unlike the request list).
 */
export function subscribeToComments(
  requestId: string,
  onNext: (comments: RestockComment[]) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  const q = query(
    collection(db, REQUESTS_COLLECTION, requestId, 'comments'),
    orderBy('createdAt', 'asc'),
  )
  return onSnapshot(
    q,
    (snapshot) => {
      onNext(
        snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }) as RestockComment),
      )
    },
    onError,
  )
}

/**
 * Adds a comment to a request's thread. Payload is exactly the field set
 * the rules allow (`authorUid`/`authorRole`/`text`/`createdAt`) — anything
 * extra is rejected by `comments`' `create` rule.
 */
export async function addComment(
  requestId: string,
  text: string,
  uid: string,
  role: UserRole,
): Promise<void> {
  await addDoc(collection(db, REQUESTS_COLLECTION, requestId, 'comments'), {
    authorUid: uid,
    authorRole: role,
    text,
    createdAt: serverTimestamp(),
  })
}

export interface RequestedItemInput {
  variantId: string
  requestedQty: number
}

export interface DispatchItemInput {
  variantId: string
  dispatchedQty: number
  dispatchNote?: string
}

/** cafetería only. Creates a new `pending` request. */
export async function createRestockRequest(items: RequestedItemInput[]): Promise<{ id: string }> {
  return callApi<{ id: string }>('createRestockRequest', { items })
}

/** cafetería only. Precondition: status == 'pending'. */
export async function editPendingRequest(
  requestId: string,
  items: RequestedItemInput[],
): Promise<{ id: string }> {
  return callApi<{ id: string }>('editPendingRequest', { requestId, items })
}

/** producción only. Precondition: status == 'pending'. */
export async function acceptRestockRequest(requestId: string): Promise<{ id: string }> {
  return callApi<{ id: string }>('acceptRestockRequest', { requestId })
}

/** producción only. Precondition: status == 'pending'. `reason` must be non-empty. */
export async function rejectRestockRequest(
  requestId: string,
  reason: string,
): Promise<{ id: string }> {
  return callApi<{ id: string }>('rejectRestockRequest', { requestId, reason })
}

/**
 * producción only. Precondition: status == 'queued'. Items omitted from
 * `items` are assumed fully dispatched — callers only need to send
 * overrides (see `DispatchForm`).
 */
export async function dispatchRestockRequest(
  requestId: string,
  items: DispatchItemInput[],
): Promise<{ id: string }> {
  return callApi<{ id: string }>('dispatchRestockRequest', { requestId, items })
}

/** cafetería only. Precondition: status == 'dispatched'. Increments `variants.stock` server-side. */
export async function confirmReceipt(requestId: string): Promise<{ id: string }> {
  return callApi<{ id: string }>('confirmReceipt', { requestId })
}
