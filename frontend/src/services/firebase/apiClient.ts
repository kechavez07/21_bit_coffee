/**
 * Shared HTTP client for the Express server (`backend/server/`), which
 * replaced Cloud Functions callables as the compute layer for anything that
 * can't be a plain Firestore rule (see `README_MIGRACION.md` — the Firebase
 * project can't activate the Blaze plan Cloud Functions requires). POSTs
 * `payload` to `${VITE_API_URL}/{path}` with the signed-in user's ID token,
 * and returns the parsed JSON body on success.
 *
 * Every route on this server responds `{error: {code, message}}` on
 * failure with a Spanish message meant to be shown as-is (see
 * `backend/server/src/routes/*.js`) — this throws a plain `Error` wrapping
 * that message, so callers can just do `err instanceof Error ? err.message
 * : ...`, no parallel error-mapping table needed (unlike `mapFirestoreError`
 * for direct Firestore writes).
 *
 * Extracted from `restockRequests.ts` (the first caller) when `catalog.ts`
 * needed the exact same thing for `deleteVariant` — two copies of this
 * would've been the wrong call.
 */
import { auth } from './config'

export async function callApi<TResult>(path: string, payload: unknown): Promise<TResult> {
  const user = auth.currentUser
  if (!user) {
    throw new Error('Debes iniciar sesión para hacer esto.')
  }
  const idToken = await user.getIdToken()

  const response = await fetch(`${import.meta.env.VITE_API_URL}/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(payload),
  })

  const body = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(body?.error?.message ?? 'Ocurrió un error inesperado. Intenta de nuevo.')
  }

  return body as TResult
}
