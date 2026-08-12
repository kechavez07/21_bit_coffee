# Backend (Firebase)

Firestore rules, indexes, and (later) Cloud Functions for the
Cafetería/Producción inventory system. See `../PLAN.md` for the full data
model and phase plan.

Project: `bit-coffee-668f6` (see `.firebaserc`).

## Provisioning a test user (Phase 1)

**Business assumption, stated explicitly:** this system has no self-service
sign-up screen — only login. Deciding who gets an account, and what role
(`"cafeteria"` | `"production"`) they get, is treated as an admin action,
not something the app exposes. There is no Cloud Function that
auto-assigns a role on first sign-in in this phase; that's an optional
enhancement left out of scope for Phase 1. This is why
`backend/firestore.rules` denies all writes to `users/{uid}` — a client can
read its own doc to resolve its role, but can never create or modify it
(which would otherwise let anyone self-promote to `"production"` and reach
catalog-CRUD permissions in later phases).

Until a provisioning Cloud Function exists, create test users by hand:

1. **Firebase Console → Authentication → Users → Add user.**
   - Enter an email.
   - If you want to test the password flow, also set a password here.
   - If you only want to test the passwordless email-link flow, a password
     is optional — email-link sign-in doesn't use it. (Make sure the
     **Email link (passwordless)** and **Email/Password** providers are
     both enabled under Authentication → Sign-in method — this was already
     done for `bit-coffee-668f6` before this phase started.)
2. **Copy the generated UID** from the Users table (or the user's detail
   page).
3. **Firestore Console → Start collection `users` (if it doesn't exist
   yet) → Document ID = that UID**, with fields:
   ```json
   {
     "email": "the-same-email@example.com",
     "role": "cafeteria"   // or "production"
   }
   ```
   `fcmToken` is not needed yet — it's written by the client in Phase 5.

Repeat for as many test accounts as you need (e.g. one `cafeteria` and one
`production` user to exercise both panels).

### Why this is safe

- `getUserRole(uid)` in `frontend/src/services/firebase/auth.ts` reads this
  doc and returns `null` if it doesn't exist — i.e. "authenticated but not
  provisioned." The frontend should treat that as "contact an admin," not
  a crash.
- Because writes to `users/{uid}` are denied for everyone (see
  `firestore.rules`), there is no path for a signed-in user to grant
  themselves a role or change it later from the client.

## Firestore status

Firestore was not yet enabled in the Firebase Console as of when this
phase's backend code was written. Nothing here depends on it being enabled
to write the code, but it must be enabled (and rules deployed) before any
of this can be exercised end-to-end — see "What's left" below.
