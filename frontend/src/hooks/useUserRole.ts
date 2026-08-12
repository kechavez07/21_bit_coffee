/**
 * Resolves the caller's role (`users/{uid}.role`) via `getUserRole`.
 *
 * Accepts either a Firebase `User`, a raw `uid` string, or `null`/`undefined`
 * (e.g. while `useAuth` is still resolving) — so callers can pass whatever
 * they already have on hand without extracting `.uid` themselves.
 *
 * `role: null` after loading finishes is a *resolved* state, not an error:
 * it means the user authenticated successfully but has no provisioned
 * account yet. UI should render "account not authorized" for that case,
 * not a generic error screen. `error` is reserved for actual failures
 * (network/Firestore errors) reading the `users/{uid}` doc.
 */
import { useEffect, useState } from 'react'
import type { User } from 'firebase/auth'
import { getUserRole, type UserRole } from '../services/firebase/auth'

export type UseUserRoleInput = User | string | null | undefined

export interface UseUserRoleResult {
  role: UserRole | null
  loading: boolean
  error: Error | null
}

function resolveUid(input: UseUserRoleInput): string | null {
  if (!input) return null
  return typeof input === 'string' ? input : input.uid
}

export function useUserRole(input: UseUserRoleInput): UseUserRoleResult {
  const uid = resolveUid(input)

  const [role, setRole] = useState<UserRole | null>(null)
  const [loading, setLoading] = useState<boolean>(Boolean(uid))
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!uid) {
      setRole(null)
      setLoading(false)
      setError(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    getUserRole(uid)
      .then((resolvedRole) => {
        if (!cancelled) setRole(resolvedRole)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [uid])

  return { role, loading, error }
}
