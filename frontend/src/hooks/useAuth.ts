/**
 * Exposes Firebase Auth session state (not Firestore data) as a hook.
 *
 * Wraps `subscribeToAuthState` from `services/firebase/auth`. `loading` is
 * `true` only until the very first auth state callback fires (Firebase's
 * "is there a persisted session?" check) — after that it's always `false`,
 * even while `user` flips between `null` and a `User` on sign-in/sign-out.
 */
import { useEffect, useState } from 'react'
import type { User } from 'firebase/auth'
import { subscribeToAuthState } from '../services/firebase/auth'

export interface UseAuthResult {
  user: User | null
  loading: boolean
}

export function useAuth(): UseAuthResult {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = subscribeToAuthState((nextUser) => {
      setUser(nextUser)
      setLoading(false)
    })

    return unsubscribe
  }, [])

  return { user, loading }
}
