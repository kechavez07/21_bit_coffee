/**
 * Subscribes to the whole `restock_requests` history.
 *
 * Same shape/posture as `useCatalog`/`useMovements`: `loading` stays `true`
 * until the first response arrives — success or error, both count as
 * "done loading" — `error` is the first Firestore error from the listener.
 */
import { useEffect, useState } from 'react'
import type { FirestoreError } from 'firebase/firestore'
import {
  subscribeToRestockRequests,
  type RestockRequest,
} from '../services/firebase/restockRequests'

export interface UseRestockRequestsResult {
  requests: RestockRequest[]
  loading: boolean
  error: Error | null
}

export function useRestockRequests(): UseRestockRequestsResult {
  const [requests, setRequests] = useState<RestockRequest[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<FirestoreError | null>(null)

  useEffect(() => {
    const unsubscribe = subscribeToRestockRequests(
      (next) => {
        setRequests(next)
        setLoaded(true)
      },
      (err) => {
        setError((current) => current ?? err)
        setLoaded(true)
      },
    )

    return unsubscribe
  }, [])

  return { requests, loading: !loaded, error }
}
