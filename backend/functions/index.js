/**
 * Cloud Functions entry point.
 *
 * Phase 0 — skeleton only. No trigger logic yet.
 *
 * Later phases will add here (see PLAN.md / .claude/agents/backend-firebase.md):
 *   - onRestockRequestCreated: Firestore trigger on `restock_requests` that
 *     looks up `production` users' fcmToken and sends an FCM push (Phase 5).
 *
 * `admin.initializeApp()` is called once here so it's available to every
 * function exported from this file/codebase.
 */

const admin = require("firebase-admin");
const { onRequest } = require("firebase-functions/v2/https");

admin.initializeApp();

/**
 * Placeholder no-op function so the `functions` codebase deploys cleanly
 * and the Firebase CLI/emulators have something to discover. Safe to
 * remove once real functions (e.g. the restock-notification trigger) are
 * added in a later phase.
 */
exports.ping = onRequest((req, res) => {
  res.status(200).send("ok");
});
