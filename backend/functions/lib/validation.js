/**
 * Server-side validation helpers for the `restock_requests` callables.
 *
 * Spanish messages match the tone already used by the client
 * (`frontend/src/utils/{firestoreErrorMessages,authErrorMessages}.ts` and
 * the inline validation in `RequestItemsForm`/`DispatchForm`/
 * `RejectReasonForm`): short, states exactly what's wrong, no apologies.
 *
 * `firestore.rules` cannot enforce any of this for `restock_requests` — the
 * client never writes that document directly, only through these callables
 * (Admin SDK, which ignores `firestore.rules` entirely) — so this file IS
 * the authorization/validation boundary for the whole restock workflow.
 */
const { HttpsError } = require("firebase-functions/v2/https");
const { getFirestore } = require("firebase-admin/firestore");

/**
 * Per-item ceiling for `requestedQty`/`dispatchedQty` (audit finding H-08).
 * Raise this constant — with a comment explaining the exception — if a
 * legitimate order ever needs more; there is no in-app override today.
 */
const MAX_QUANTITY_PER_ITEM = 500;

function requireAuth(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión para hacer esto.");
  }
  return request.auth.uid;
}

/** Mirrors `getUserRole` in `frontend/src/services/firebase/auth.ts` — same doc, same two valid values. */
async function getCallerRole(uid) {
  const snap = await getFirestore().collection("users").doc(uid).get();
  if (!snap.exists) return null;
  const role = snap.data().role;
  return role === "cafeteria" || role === "production" ? role : null;
}

async function requireRole(uid, allowedRole) {
  const role = await getCallerRole(uid);
  if (role !== allowedRole) {
    throw new HttpsError("permission-denied", "Tu cuenta no tiene permiso para hacer esto.");
  }
}

function nonEmptyString(value, fieldLabel) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) {
    throw new HttpsError("invalid-argument", `${fieldLabel} es obligatorio.`);
  }
  return trimmed;
}

/** Integer validation with the H-08 ceiling baked in — used for both `requestedQty` and `dispatchedQty`. */
function validQuantity(value, fieldLabel, { allowZero = false } = {}) {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new HttpsError("invalid-argument", `${fieldLabel} debe ser un número entero.`);
  }
  const min = allowZero ? 0 : 1;
  if (value < min) {
    throw new HttpsError(
      "invalid-argument",
      allowZero ? `${fieldLabel} debe ser mayor o igual a 0.` : `${fieldLabel} debe ser mayor a 0.`,
    );
  }
  if (value > MAX_QUANTITY_PER_ITEM) {
    throw new HttpsError(
      "invalid-argument",
      `${fieldLabel} no puede superar ${MAX_QUANTITY_PER_ITEM} unidades por producto.`,
    );
  }
  return value;
}

function assertStatus(currentStatus, allowedStatuses) {
  if (!allowedStatuses.includes(currentStatus)) {
    throw new HttpsError(
      "failed-precondition",
      `Este pedido ya no está en un estado válido para esta acción (estado actual: "${currentStatus}").`,
    );
  }
}

/** Raw-shape validation for `items: [{variantId, requestedQty}]` (create/edit) — no Firestore reads here, see `enrichItems` in `restockRequests.js`. */
function validateRequestedItemsInput(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new HttpsError("invalid-argument", "El pedido debe tener al menos un producto.");
  }
  const seen = new Set();
  for (const item of items) {
    if (!item || typeof item.variantId !== "string" || !item.variantId) {
      throw new HttpsError("invalid-argument", "Cada producto del pedido necesita una variante válida.");
    }
    if (seen.has(item.variantId)) {
      throw new HttpsError("invalid-argument", "No se puede pedir la misma variante dos veces en un solo pedido.");
    }
    seen.add(item.variantId);
    validQuantity(item.requestedQty, "La cantidad pedida");
  }
}

/** Raw-shape validation for `items: [{variantId, dispatchedQty, dispatchNote?}]` (dispatch). */
function validateDispatchItemsInput(items) {
  if (!Array.isArray(items)) {
    throw new HttpsError("invalid-argument", "La lista de productos despachados no es válida.");
  }
  const seen = new Set();
  for (const item of items) {
    if (!item || typeof item.variantId !== "string" || !item.variantId) {
      throw new HttpsError("invalid-argument", "Cada producto despachado necesita una variante válida.");
    }
    if (seen.has(item.variantId)) {
      throw new HttpsError("invalid-argument", "No se puede despachar la misma variante dos veces.");
    }
    seen.add(item.variantId);
    validQuantity(item.dispatchedQty, "La cantidad despachada", { allowZero: true });
    if (item.dispatchNote !== undefined && typeof item.dispatchNote !== "string") {
      throw new HttpsError("invalid-argument", "La nota de despacho debe ser texto.");
    }
  }
}

module.exports = {
  MAX_QUANTITY_PER_ITEM,
  requireAuth,
  getCallerRole,
  requireRole,
  nonEmptyString,
  validQuantity,
  assertStatus,
  validateRequestedItemsInput,
  validateDispatchItemsInput,
};
