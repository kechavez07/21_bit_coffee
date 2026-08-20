/**
 * Server-side validation helpers for the `restock_requests` routes.
 *
 * Ported from `backend/functions/lib/validation.js` (Cloud Functions
 * version) — same rules, same Spanish messages, only `HttpsError` (Cloud
 * Functions-only) swapped for `AppError` (see `./errors.js`). `requireAuth`
 * is dropped here: token verification now happens once, up front, in
 * `src/middleware/auth.js` (`admin.auth().verifyIdToken()`), not per-route
 * via a callable's `request.auth`.
 *
 * `requireRole` keeps its original (uid, allowedRole) shape and re-reads
 * `users/{uid}.role` itself rather than trusting `req.role` set by the
 * auth middleware — an extra Firestore read per request, traded for being
 * a verbatim port of the already-tested Cloud Functions logic instead of a
 * rewritten authorization path.
 */
const { getFirestore } = require("firebase-admin/firestore");
const { AppError } = require("./errors");

const MAX_QUANTITY_PER_ITEM = 500;

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
    throw new AppError("permission-denied", "Tu cuenta no tiene permiso para hacer esto.");
  }
}

function nonEmptyString(value, fieldLabel) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) {
    throw new AppError("invalid-argument", `${fieldLabel} es obligatorio.`);
  }
  return trimmed;
}

/** Integer validation with the H-08 ceiling baked in — used for both `requestedQty` and `dispatchedQty`. */
function validQuantity(value, fieldLabel, { allowZero = false } = {}) {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new AppError("invalid-argument", `${fieldLabel} debe ser un número entero.`);
  }
  const min = allowZero ? 0 : 1;
  if (value < min) {
    throw new AppError(
      "invalid-argument",
      allowZero ? `${fieldLabel} debe ser mayor o igual a 0.` : `${fieldLabel} debe ser mayor a 0.`,
    );
  }
  if (value > MAX_QUANTITY_PER_ITEM) {
    throw new AppError(
      "invalid-argument",
      `${fieldLabel} no puede superar ${MAX_QUANTITY_PER_ITEM} unidades por producto.`,
    );
  }
  return value;
}

function assertStatus(currentStatus, allowedStatuses) {
  if (!allowedStatuses.includes(currentStatus)) {
    throw new AppError(
      "failed-precondition",
      `Este pedido ya no está en un estado válido para esta acción (estado actual: "${currentStatus}").`,
    );
  }
}

/** Raw-shape validation for `items: [{variantId, requestedQty}]` (create/edit). */
function validateRequestedItemsInput(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new AppError("invalid-argument", "El pedido debe tener al menos un producto.");
  }
  const seen = new Set();
  for (const item of items) {
    if (!item || typeof item.variantId !== "string" || !item.variantId) {
      throw new AppError("invalid-argument", "Cada producto del pedido necesita una variante válida.");
    }
    if (seen.has(item.variantId)) {
      throw new AppError("invalid-argument", "No se puede pedir la misma variante dos veces en un solo pedido.");
    }
    seen.add(item.variantId);
    validQuantity(item.requestedQty, "La cantidad pedida");
  }
}

/** Raw-shape validation for `items: [{variantId, dispatchedQty, dispatchNote?}]` (dispatch). */
function validateDispatchItemsInput(items) {
  if (!Array.isArray(items)) {
    throw new AppError("invalid-argument", "La lista de productos despachados no es válida.");
  }
  const seen = new Set();
  for (const item of items) {
    if (!item || typeof item.variantId !== "string" || !item.variantId) {
      throw new AppError("invalid-argument", "Cada producto despachado necesita una variante válida.");
    }
    if (seen.has(item.variantId)) {
      throw new AppError("invalid-argument", "No se puede despachar la misma variante dos veces.");
    }
    seen.add(item.variantId);
    validQuantity(item.dispatchedQty, "La cantidad despachada", { allowZero: true });
    if (item.dispatchNote !== undefined && typeof item.dispatchNote !== "string") {
      throw new AppError("invalid-argument", "La nota de despacho debe ser texto.");
    }
  }
}

module.exports = {
  MAX_QUANTITY_PER_ITEM,
  getCallerRole,
  requireRole,
  nonEmptyString,
  validQuantity,
  assertStatus,
  validateRequestedItemsInput,
  validateDispatchItemsInput,
};
