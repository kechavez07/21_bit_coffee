/**
 * Cloud Functions entry point.
 *
 * `admin.initializeApp()` is called once here, before any `lib/*` module
 * that touches `admin.firestore()`/`admin.messaging()` is required — those
 * modules call `admin.firestore()` lazily inside function bodies (not at
 * module load time) specifically so init order never matters, but keep
 * this call first regardless.
 *
 * `restock_requests` lifecycle (see `lib/restockRequests.js` for the full
 * state machine and `frontend/src/services/firebase/restockRequests.ts`
 * for the client contract these callables satisfy):
 */

const admin = require("firebase-admin");
const { onRequest } = require("firebase-functions/v2/https");

admin.initializeApp();

const {
  createRestockRequest,
  editPendingRequest,
  acceptRestockRequest,
  rejectRestockRequest,
  dispatchRestockRequest,
  confirmReceipt,
} = require("./lib/restockRequests");

exports.createRestockRequest = createRestockRequest;
exports.editPendingRequest = editPendingRequest;
exports.acceptRestockRequest = acceptRestockRequest;
exports.rejectRestockRequest = rejectRestockRequest;
exports.dispatchRestockRequest = dispatchRestockRequest;
exports.confirmReceipt = confirmReceipt;

/**
 * Placeholder no-op function kept from Phase 0 so the Firebase CLI/emulators
 * always have at least one function to discover even if the codebase above
 * is mid-edit. Harmless to leave deployed.
 */
exports.ping = onRequest((req, res) => {
  res.status(200).send("ok");
});
