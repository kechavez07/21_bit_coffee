/**
 * Subscribes to a single restock request's `comments` thread.
 *
 * Reacts to a changing `requestId` the same way `useUserRole` reacts to a
 * changing `uid`: a falsy `requestId` (thread not open yet) resets to the
 * empty/idle state instead of subscribing to anything.
 */
import { useEffect, useState } from 'react'
import type { FirestoreError } from 'firebase/firestore'
import { subscribeToComments, type RestockComment } from '../services/firebase/restockRequests'

export interface UseCommentsResult {
  comments: RestockComment[]
  loading: boolean
  error: Error | null
}

export function useComments(requestId: string | null | undefined): UseCommentsResult {
  const [comments, setComments] = useState<RestockComment[]>([])
  const [loading, setLoading] = useState<boolean>(Boolean(requestId))
  const [error, setError] = useState<FirestoreError | null>(null)

  useEffect(() => {
    if (!requestId) {
      setComments([])
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    const unsubscribe = subscribeToComments(
      requestId,
      (next) => {
        setComments(next)
        setLoading(false)
      },
      (err) => {
        setError(err)
        setLoading(false)
      },
    )

    return unsubscribe
  }, [requestId])

  return { comments, loading, error }
}
