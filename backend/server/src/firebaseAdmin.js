/**
 * `firebase-admin` initialization for the Express server.
 *
 * Two modes, chosen by whether `FIRESTORE_EMULATOR_HOST` is set:
 *  - Emulator (local dev): no credentials needed, same as
 *    `backend/functions/seed-emulator.js` — just `projectId`.
 *  - Real Firebase (Render): Render doesn't support uploading secret
 *    files, so the full service account JSON is read from the
 *    `FIREBASE_SERVICE_ACCOUNT_JSON` env var as a single-line string
 *    instead of a `serviceAccountKey.json` file.
 *
 * Call `initializeFirebaseAdmin()` once, before any route or middleware
 * touches `admin.auth()`/`getFirestore()`/`getMessaging()`.
 */
const admin = require("firebase-admin");

function initializeFirebaseAdmin() {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  if (process.env.FIRESTORE_EMULATOR_HOST) {
    return admin.initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || "bit-coffee-668f6",
    });
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_JSON is not set and FIRESTORE_EMULATOR_HOST is not set — " +
        "no way to initialize firebase-admin. See .env.example.",
    );
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(serviceAccountJson);
  } catch (err) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.");
  }

  return admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

module.exports = { admin, initializeFirebaseAdmin };
