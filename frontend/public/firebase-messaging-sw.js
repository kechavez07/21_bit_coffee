/**
 * Firebase Cloud Messaging service worker — background notifications.
 *
 * Phase 6. This is a STATIC file (not processed by Vite — it must be
 * served from `/firebase-messaging-sw.js` verbatim), deliberately SEPARATE
 * from the PWA app-shell service worker that `vite-plugin-pwa` generates
 * (`generateSW` strategy, see `frontend/vite.config.ts`). Merging the two
 * would require switching that plugin to `injectManifest`, which is more
 * invasive than this phase needs. Instead this worker is registered with
 * its own explicit, non-root scope (see `services/firebase/messaging.ts`,
 * `/firebase-messaging-sw-push-scope/`) so it never competes with the PWA
 * worker for control of `/` — `push` events are delivered to whichever
 * `ServiceWorkerRegistration` was passed to `getToken()`, independent of
 * which worker currently controls the page.
 *
 * Uses the `-compat` builds via `importScripts` (CDN) because service
 * workers only support the compat/namespaced API without a bundler step.
 * Version pinned to match the `firebase` package major installed in
 * `package.json` (`^12.x`).
 *
 * The config below is the project's public Web SDK config (not a secret —
 * see https://firebase.google.com/docs/projects/api-keys), fetched with
 * `firebase apps:sdkconfig web --project bit-coffee-668f6`. It intentionally
 * does NOT come from Vite env vars: this file is served as a static asset,
 * untouched by the build, so it can't read `import.meta.env`.
 */
importScripts('https://www.gstatic.com/firebasejs/12.17.1/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/12.17.1/firebase-messaging-compat.js')

firebase.initializeApp({
  apiKey: 'AIzaSyAcSkIPJ7KMGCKD1dBjqyrz5F9dZGurpcQ',
  authDomain: 'bit-coffee-668f6.firebaseapp.com',
  projectId: 'bit-coffee-668f6',
  storageBucket: 'bit-coffee-668f6.firebasestorage.app',
  messagingSenderId: '800537398162',
  appId: '1:800537398162:web:ada83f7a6bf914da148f4b',
})

const messaging = firebase.messaging()

/**
 * Maps a restock-request notification's `data.type` (see the 6 callables
 * in `backend/functions/lib/restockRequests.js`, all `sendPushToRole`
 * calls) to the tab of the app that's relevant for that event. There is no
 * per-request detail route in the SPA (`RestockRequestDetail` is rendered
 * inline inside list screens, not routed) — clicking a notification opens
 * the list screen where the request will be visible, it doesn't deep-link
 * to the request itself.
 */
function urlForNotificationData(data) {
  switch (data && data.type) {
    case 'restock_created':
    case 'restock_edited':
      return '/production/solicitudes'
    case 'restock_received':
      return '/production/solicitudes'
    case 'restock_accepted':
    case 'restock_rejected':
    case 'restock_dispatched':
      return '/cafeteria/pedidos'
    default:
      return '/'
  }
}

messaging.onBackgroundMessage((payload) => {
  const title = (payload.notification && payload.notification.title) || '21 Bit Coffee'
  const body = payload.notification && payload.notification.body
  const data = payload.data || {}

  self.registration.showNotification(title, {
    body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    data,
  })
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const targetUrl = urlForNotificationData(event.notification.data)

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })

      const existing = allClients.find((client) => {
        const clientUrl = new URL(client.url)
        return clientUrl.origin === self.location.origin
      })

      if (existing) {
        await existing.focus()
        if ('navigate' in existing) {
          await existing.navigate(targetUrl)
        }
        return
      }

      await self.clients.openWindow(targetUrl)
    })(),
  )
})
