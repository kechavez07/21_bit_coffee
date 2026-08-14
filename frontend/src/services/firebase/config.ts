/**
 * Firebase app initialization.
 *
 * Reads configuration exclusively from Vite env vars (VITE_FIREBASE_*).
 * Never hardcode real credentials here — see `.env.example` for the
 * expected keys and copy it to `.env` (gitignored) with real values.
 *
 * Emulator opt-in (Phase 3): when `VITE_USE_FIREBASE_EMULATOR === 'true'`,
 * Auth/Firestore/Functions are pointed at the local Firebase emulator
 * suite instead of the real `bit-coffee-668f6` project, so the catalog
 * screens can be exercised end to end without writing to production. Ports
 * below match `backend/firebase.json`. Off by default — omitting the flag
 * (or setting it to anything other than `'true'`) keeps the previous
 * behavior unchanged.
 */
import { initializeApp, type FirebaseApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth'
import {
  connectFirestoreEmulator,
  getFirestore,
  type Firestore,
} from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const useEmulator = import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true'

if (import.meta.env.DEV && !useEmulator) {
  const missing = Object.entries(firebaseConfig)
    .filter(([, value]) => !value)
    .map(([key]) => key)

  if (missing.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `[firebase] Missing env vars: ${missing.join(', ')}. ` +
        'Copy .env.example to .env and fill in your Firebase project config.',
    )
  }
}

export const app: FirebaseApp = initializeApp(
  useEmulator
    ? { ...firebaseConfig, projectId: firebaseConfig.projectId || 'bit-coffee-668f6' }
    : firebaseConfig,
)
export const auth: Auth = getAuth(app)
export const db: Firestore = getFirestore(app)
export const functions: Functions = getFunctions(app)

if (useEmulator) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  connectFunctionsEmulator(functions, '127.0.0.1', 5001)

  // eslint-disable-next-line no-console
  console.info('[firebase] Using local emulator suite (VITE_USE_FIREBASE_EMULATOR=true).')
}
