/**
 * Authentication service.
 *
 * Wraps Firebase Auth for the one supported sign-in method — email/password
 * (`signInWithPassword`). The email-link/passwordless flow that used to
 * live here (`sendEmailLink`/`isEmailLinkSignIn`/`completeEmailLinkSignIn`,
 * plus the `/finish-signin` page that completed it) was removed; password
 * is the only path now.
 *
 * Also exposes `getUserRole`, which resolves the caller's role from the
 * `users/{uid}` Firestore doc (see `backend/firestore.rules`: a signed-in
 * user may only read their own doc).
 *
 * IMPORTANT — business assumption (see backend/README.md for the full
 * rationale): there is no self-service sign-up in this system. A user
 * document with a `role` is only ever created manually (Firebase Console or
 * a seed script), never by the client. If `getUserRole` returns `null`, the
 * user authenticated successfully but has not been provisioned yet — the
 * frontend should treat that as "contact an admin", not as an error to retry.
 *
 * This module owns *auth* concerns only. It does not build UI and does not
 * decide routing/redirects. It DOES own writing the FCM token to
 * `users/{uid}` (`saveFcmToken`, Phase 6) — same rationale as
 * `getUserRole`, both touch that same document, and keeping every write to
 * it in one place makes it easy to eyeball against the Firestore rule that
 * constrains it (see `backend/firestore.rules`, `match /users/{userId}`).
 * *Obtaining* the token (permission prompt, service worker registration,
 * `getToken()`) is a messaging concern and lives in `./messaging.ts`
 * instead.
 */
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
  type UserCredential,
  type Unsubscribe,
} from 'firebase/auth'
import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { auth, db } from './config'

export type UserRole = 'cafeteria' | 'production'

/**
 * Signs in with email + password.
 */
export function signInWithPassword(
  email: string,
  password: string,
): Promise<UserCredential> {
  return signInWithEmailAndPassword(auth, email, password)
}

/**
 * Wrapper of `onAuthStateChanged`. Returns the `Unsubscribe` function so
 * callers (frontend) can clean up in a `useEffect` return / equivalent.
 */
export function subscribeToAuthState(
  callback: (user: User | null) => void,
): Unsubscribe {
  return onAuthStateChanged(auth, callback)
}

/**
 * Reads `users/{uid}` and returns its `role`, or `null` if the doc doesn't
 * exist (authenticated user with no provisioned account/role yet — see the
 * module-level doc comment and backend/README.md).
 */
export async function getUserRole(uid: string): Promise<UserRole | null> {
  const snapshot = await getDoc(doc(db, 'users', uid))

  if (!snapshot.exists()) {
    return null
  }

  const role = snapshot.data().role
  return role === 'cafeteria' || role === 'production' ? role : null
}

/**
 * Signs the current user out.
 */
export function signOutUser(): Promise<void> {
  return signOut(auth)
}

/**
 * Saves an FCM device token to `users/{uid}`.
 *
 * The payload is EXACTLY `{fcmToken, fcmTokenUpdatedAt}` — the only diff
 * the `users/{userId}` Firestore rule allows a signed-in user to write to
 * their own doc (`request.resource.data.diff(resource.data).affectedKeys()
 * .hasOnly(['fcmToken', 'fcmTokenUpdatedAt'])`). Adding any other field
 * here would make every call rejected by the rule, not just this one.
 */
export function saveFcmToken(uid: string, token: string): Promise<void> {
  return updateDoc(doc(db, 'users', uid), {
    fcmToken: token,
    fcmTokenUpdatedAt: serverTimestamp(),
  })
}
