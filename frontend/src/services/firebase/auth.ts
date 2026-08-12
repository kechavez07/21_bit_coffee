/**
 * Authentication service.
 *
 * Wraps Firebase Auth for the two supported sign-in methods (Phase 1):
 *   1. Email/password — `signInWithPassword`.
 *   2. Email link / passwordless — `sendEmailLink` + `completeEmailLinkSignIn`.
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
 * This module owns *auth* concerns only. It does not build UI, does not
 * decide routing/redirects, and does not manage FCM tokens (that lands in
 * Phase 5, alongside its own service).
 */
import {
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  signInWithEmailAndPassword,
  signInWithEmailLink,
  signOut,
  type User,
  type UserCredential,
  type Unsubscribe,
} from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from './config'

/** localStorage key used to round-trip the email across the email-link flow. */
const EMAIL_FOR_SIGN_IN_KEY = 'emailForSignIn'

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
 * Sends a passwordless sign-in link to `email`.
 *
 * The link always points back at `/finish-signin` on the current origin,
 * with `handleCodeInApp: true` so Firebase hands control back to the app
 * instead of showing its own landing page. On success, the email is cached
 * in localStorage so `completeEmailLinkSignIn` can complete the flow
 * without asking the user to retype it (same-device case).
 */
export async function sendEmailLink(email: string): Promise<void> {
  const actionCodeSettings = {
    url: `${window.location.origin}/finish-signin`,
    handleCodeInApp: true,
  }

  await sendSignInLinkToEmail(auth, email, actionCodeSettings)
  window.localStorage.setItem(EMAIL_FOR_SIGN_IN_KEY, email)
}

/**
 * Wrapper of `isSignInWithEmailLink` — lets the frontend detect whether a
 * given URL (typically `window.location.href`) is a valid email sign-in
 * link before attempting to complete the flow.
 */
export function isEmailLinkSignIn(url: string): boolean {
  return isSignInWithEmailLink(auth, url)
}

/**
 * Completes a passwordless sign-in started by `sendEmailLink`.
 *
 * - If `email` is omitted, it's read from localStorage (`emailForSignIn`).
 * - If it's not there either (the user opened the link on a different
 *   device than the one that requested it), this throws an Error whose
 *   `message` is exactly `'EMAIL_REQUIRED'` so the frontend can catch it
 *   and prompt the user to re-enter their email.
 * - On success, the cached email is cleared from localStorage.
 */
export async function completeEmailLinkSignIn(
  url: string,
  email?: string,
): Promise<UserCredential> {
  const resolvedEmail =
    email ?? window.localStorage.getItem(EMAIL_FOR_SIGN_IN_KEY)

  if (!resolvedEmail) {
    throw new Error('EMAIL_REQUIRED')
  }

  const credential = await signInWithEmailLink(auth, resolvedEmail, url)
  window.localStorage.removeItem(EMAIL_FOR_SIGN_IN_KEY)
  return credential
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
