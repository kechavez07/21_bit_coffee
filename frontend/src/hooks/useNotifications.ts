/**
 * Push-notification opt-in + foreground message state for the current
 * user.
 *
 * Phase 6. Two independent concerns bundled together because both are
 * only ever consumed from the same place (`NotificationsToggle`, rendered
 * once per layout):
 *   1. `permission`/`enabling`/`error`/`enableNotifications()` — the
 *      opt-in flow. Mirrors the browser's own `Notification.permission`
 *      values (`'default' | 'granted' | 'denied'`) plus `'unsupported'`
 *      for browsers/contexts where `isSupported()` said no (treated as a
 *      quiet no-op, not an error — see `services/firebase/messaging.ts`).
 *      Deliberately does NOT run on mount — `enableNotifications` must be
 *      called from a user-gesture handler (a click), never automatically,
 *      for reliable cross-browser permission-prompt behavior.
 *   2. `latestMessage` — subscribed via `onForegroundMessage` for as long
 *      as this hook is mounted, so the layout can render a toast. Only
 *      subscribes when messaging is supported AND permission is already
 *      `'granted'` (no token yet means nothing will ever arrive on this
 *      device, and calling `getMessaging()` in a truly unsupported
 *      environment can throw).
 */
import { useCallback, useEffect, useState } from 'react'
import type { MessagePayload } from 'firebase/messaging'
import { useAuth } from './useAuth'
import { saveFcmToken } from '../services/firebase/auth'
import {
  isMessagingSupported,
  onForegroundMessage,
  requestNotificationPermissionAndToken,
} from '../services/firebase/messaging'

export type NotificationPermissionState = NotificationPermission | 'unsupported'

export interface UseNotificationsResult {
  /** Mirrors `Notification.permission`, plus `'unsupported'`. */
  permission: NotificationPermissionState
  /** `true` while `enableNotifications()` is in flight. */
  enabling: boolean
  /** Human-readable message from the last failed `enableNotifications()` call. */
  error: string | null
  /** Most recent foreground message, if any arrived while mounted. */
  latestMessage: MessagePayload | null
  /** Runs the permission + token + save flow. Call from a click handler. */
  enableNotifications: () => Promise<void>
}

function initialPermission(): NotificationPermissionState {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
}

export function useNotifications(): UseNotificationsResult {
  const { user } = useAuth()
  const [permission, setPermission] = useState<NotificationPermissionState>(initialPermission)
  const [enabling, setEnabling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [latestMessage, setLatestMessage] = useState<MessagePayload | null>(null)

  const enableNotifications = useCallback(async () => {
    if (!user) {
      setError('Iniciá sesión antes de activar las notificaciones.')
      return
    }

    setEnabling(true)
    setError(null)
    try {
      const result = await requestNotificationPermissionAndToken()

      if (result.status === 'unsupported') {
        setPermission('unsupported')
        return
      }

      if (result.status === 'denied') {
        setPermission('denied')
        return
      }

      await saveFcmToken(user.uid, result.token)
      setPermission('granted')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron activar las notificaciones.')
    } finally {
      setEnabling(false)
    }
  }, [user])

  useEffect(() => {
    if (permission !== 'granted') {
      return
    }

    let unsubscribe: (() => void) | undefined
    let cancelled = false

    isMessagingSupported().then((supported) => {
      if (!supported || cancelled) {
        return
      }
      unsubscribe = onForegroundMessage((payload) => {
        setLatestMessage(payload)
      })
    })

    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [permission])

  return { permission, enabling, error, latestMessage, enableNotifications }
}
