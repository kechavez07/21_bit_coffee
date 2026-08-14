/**
 * FCM (Firebase Cloud Messaging) client service.
 *
 * Phase 6. This module owns *messaging* concerns only — requesting
 * permission, registering the dedicated service worker
 * (`public/firebase-messaging-sw.js`), getting a device token, and wrapping
 * foreground message delivery. Saving that token to `users/{uid}` is an
 * *auth* concern and lives in `./auth.ts` (`saveFcmToken`), same as
 * `getUserRole` — that module already owns the `users/{uid}` document.
 *
 * Deliberately NOT wired to the emulator suite (see `./config.ts`'s header
 * comment) — Firebase Cloud Messaging has no emulator, and none of this
 * requires the Blaze plan (Messaging is free at any tier; only the
 * *sending* side, `backend/functions/lib/notify.js`, needs deployed Cloud
 * Functions).
 */
import {
  getMessaging,
  getToken,
  isSupported,
  onMessage,
  type MessagePayload,
  type Messaging,
  type Unsubscribe,
} from 'firebase/messaging'
import { app } from './config'

/**
 * Deliberately not `/` — see `public/firebase-messaging-sw.js`'s header
 * comment. `vite-plugin-pwa` already registers its own service worker with
 * scope `/` (the PWA app-shell cache); giving this one its own explicit
 * scope means the two never fight over control of the page. The file
 * itself lives at the origin root (a service worker's scope can never be
 * broader than the directory its script is served from), so any
 * `/firebase-messaging-sw-push-scope/*` path is valid even though nothing
 * is actually served under it.
 */
const PUSH_SW_SCOPE = '/firebase-messaging-sw-push-scope/'
const PUSH_SW_URL = '/firebase-messaging-sw.js'

let messagingInstance: Messaging | null = null

function getMessagingInstance(): Messaging {
  if (!messagingInstance) {
    messagingInstance = getMessaging(app)
  }
  return messagingInstance
}

export type NotificationPermissionResult =
  | { status: 'unsupported' }
  | { status: 'denied' }
  | { status: 'granted'; token: string }

/**
 * Full opt-in flow, meant to run from a user-gesture handler (a button
 * click) — never automatically on mount, so it works reliably across
 * browsers and doesn't surprise the user with a permission prompt on
 * login.
 *
 * Steps, each short-circuiting to a result the caller can render:
 *   1. `isSupported()` — feature-detects Safari/non-HTTPS/no-SW contexts.
 *      Treated as "not available", not an error.
 *   2. `Notification.requestPermission()`.
 *   3. Register the dedicated push service worker with its explicit scope.
 *   4. `getToken()` against `VITE_FIREBASE_VAPID_KEY`.
 *
 * Throws only for genuinely unexpected failures (e.g. `getToken` rejecting
 * for a reason other than permission/support); callers should catch and
 * surface `error.message`.
 */
export async function requestNotificationPermissionAndToken(): Promise<NotificationPermissionResult> {
  const supported = await isSupported()
  if (!supported) {
    return { status: 'unsupported' }
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return { status: 'denied' }
  }

  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY
  if (!vapidKey) {
    throw new Error(
      'Falta VITE_FIREBASE_VAPID_KEY. Generá el par de claves Web Push en ' +
        'Firebase Console (Configuración del proyecto → Cloud Messaging → ' +
        'Certificados web push) y agregala a frontend/.env.',
    )
  }

  const registration = await navigator.serviceWorker.register(PUSH_SW_URL, {
    scope: PUSH_SW_SCOPE,
  })

  const token = await getToken(getMessagingInstance(), {
    vapidKey,
    serviceWorkerRegistration: registration,
  })

  return { status: 'granted', token }
}

/**
 * Re-exported feature detection, so callers (namely `useNotifications`)
 * can skip subscribing to foreground messages altogether in environments
 * where `getMessaging()` itself would throw (Safari without the right
 * flags, non-HTTPS/non-localhost origins, no Service Worker support).
 */
export function isMessagingSupported(): Promise<boolean> {
  return isSupported()
}

/**
 * Wraps `onMessage` — fires only for messages that arrive while the app is
 * in the foreground (a focused/visible tab). Background messages never
 * reach this callback; they're handled entirely by
 * `public/firebase-messaging-sw.js`'s `onBackgroundMessage`, per FCM's own
 * design (the browser won't hand a push to a page that's already open and
 * listening).
 *
 * Returns the `Unsubscribe` function so callers can clean up in a
 * `useEffect` return.
 */
export function onForegroundMessage(
  callback: (payload: MessagePayload) => void,
): Unsubscribe {
  return onMessage(getMessagingInstance(), callback)
}
