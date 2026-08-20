/**
 * The 6 `restock_requests` lifecycle operations — pure functions of
 * `(uid, role, payload)`.
 *
 * Ported from `backend/functions/lib/restockRequests.js` (Cloud Functions
 * `onCall` version). Each function used to be `onCall(async (request) => {
 * const uid = requireAuth(request); ... })`; here `uid` comes from
 * `src/middleware/auth.js` (already-verified ID token) and `payload`
 * replaces `request.data`. `role` is resolved by the same middleware but,
 * same as the original, the actual authorization gate is `requireRole`
 * re-reading `users/{uid}.role` — see `./validation.js`'s doc comment.
 *
 * Contract (param/response shape, state machine, precondition rules) comes
 * from `frontend/src/services/firebase/restockRequests.ts` — unchanged by
 * this migration, still the spec.
 *
 * State machine:
 *   pending --accept (production)--> queued --dispatch (production)--> dispatched --confirmReceipt (cafeteria)--> received
 *      |
 *      +--edit (cafeteria, only while pending)
 *      +--reject (production, ONLY from pending, reason required) --> rejected [terminal]
 */
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const {
  requireRole,
  nonEmptyString,
  assertStatus,
  validateRequestedItemsInput,
  validateDispatchItemsInput,
} = require("./validation");
const { AppError } = require("./errors");
const { notifyRestockEvent } = require("./notify");

const REQUESTS_COLLECTION = "restock_requests";
const VARIANTS_COLLECTION = "variants";
const PRODUCTS_COLLECTION = "products";

/**
 * Reads `variants/{variantId}` + its parent `products/{productId}` for
 * each requested item and builds the enriched `RestockRequestItem` shape
 * the client expects. Throws if a variant doesn't exist or is inactive.
 */
async function enrichItems(db, items) {
  const enriched = [];
  for (const item of items) {
    const variantSnap = await db.collection(VARIANTS_COLLECTION).doc(item.variantId).get();
    if (!variantSnap.exists) {
      throw new AppError("invalid-argument", "Una de las variantes del pedido ya no existe.");
    }
    const variant = variantSnap.data();
    if (!variant.active) {
      throw new AppError(
        "invalid-argument",
        `"${variant.flavor || "Una de las variantes"}" ya no está activa.`,
      );
    }

    const productSnap = await db.collection(PRODUCTS_COLLECTION).doc(variant.productId).get();
    const productName = productSnap.exists ? productSnap.data().name : "Producto";

    enriched.push({
      variantId: item.variantId,
      productId: variant.productId,
      productName,
      flavor: variant.flavor ?? null,
      currentStockAtRequest: typeof variant.stock === "number" ? variant.stock : 0,
      requestedQty: item.requestedQty,
    });
  }
  return enriched;
}

/** cafetería only. Creates a new `pending` request. */
async function createRestockRequest(uid, role, payload) {
  await requireRole(uid, "cafeteria");

  const items = payload && payload.items;
  validateRequestedItemsInput(items);

  const db = getFirestore();
  const enrichedItems = await enrichItems(db, items);

  const docRef = db.collection(REQUESTS_COLLECTION).doc();
  const now = FieldValue.serverTimestamp();
  await docRef.set({
    requestedBy: uid,
    status: "pending",
    items: enrichedItems,
    createdAt: now,
    updatedAt: now,
  });

  await notifyRestockEvent("restock_created", { items: enrichedItems }, docRef.id);

  return { id: docRef.id };
}

/** cafetería only, and only the request's own creator. Precondition: status == 'pending'. */
async function editPendingRequest(uid, role, payload) {
  await requireRole(uid, "cafeteria");

  const { requestId, items } = payload || {};
  nonEmptyString(requestId, "El pedido");
  validateRequestedItemsInput(items);

  const db = getFirestore();
  const docRef = db.collection(REQUESTS_COLLECTION).doc(requestId);
  const snap = await docRef.get();
  if (!snap.exists) {
    throw new AppError("not-found", "El pedido no existe.");
  }
  const current = snap.data();
  if (current.requestedBy !== uid) {
    throw new AppError("permission-denied", "Solo quien creó el pedido puede editarlo.");
  }
  assertStatus(current.status, ["pending"]);

  const enrichedItems = await enrichItems(db, items);

  await docRef.update({
    items: enrichedItems,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: uid,
  });

  await notifyRestockEvent("restock_edited", { items: enrichedItems }, requestId);

  return { id: requestId };
}

/** producción only. Precondition: status == 'pending'. */
async function acceptRestockRequest(uid, role, payload) {
  await requireRole(uid, "production");

  const { requestId } = payload || {};
  nonEmptyString(requestId, "El pedido");

  const db = getFirestore();
  const docRef = db.collection(REQUESTS_COLLECTION).doc(requestId);
  const snap = await docRef.get();
  if (!snap.exists) {
    throw new AppError("not-found", "El pedido no existe.");
  }
  const current = snap.data();
  assertStatus(current.status, ["pending"]);

  const now = FieldValue.serverTimestamp();
  await docRef.update({
    status: "queued",
    acceptedAt: now,
    acceptedBy: uid,
    updatedAt: now,
    updatedBy: uid,
  });

  await notifyRestockEvent("restock_accepted", current, requestId);

  return { id: requestId };
}

/** producción only. Precondition: status == 'pending' (NOT 'queued' — see module doc comment). `reason` must be non-empty. */
async function rejectRestockRequest(uid, role, payload) {
  await requireRole(uid, "production");

  const { requestId, reason } = payload || {};
  nonEmptyString(requestId, "El pedido");
  const trimmedReason = nonEmptyString(reason, "El motivo del rechazo");

  const db = getFirestore();
  const docRef = db.collection(REQUESTS_COLLECTION).doc(requestId);
  const snap = await docRef.get();
  if (!snap.exists) {
    throw new AppError("not-found", "El pedido no existe.");
  }
  const current = snap.data();
  assertStatus(current.status, ["pending"]);

  const now = FieldValue.serverTimestamp();
  await docRef.update({
    status: "rejected",
    rejectedAt: now,
    rejectedBy: uid,
    rejectionReason: trimmedReason,
    updatedAt: now,
    updatedBy: uid,
  });

  await notifyRestockEvent("restock_rejected", current, requestId, { reason: trimmedReason });

  return { id: requestId };
}

/**
 * producción only. Precondition: status == 'queued'. Items omitted from
 * `items` are assumed fully dispatched (dispatchedQty = requestedQty).
 */
async function dispatchRestockRequest(uid, role, payload) {
  await requireRole(uid, "production");

  const { requestId, items } = payload || {};
  nonEmptyString(requestId, "El pedido");
  validateDispatchItemsInput(items);

  const db = getFirestore();
  const docRef = db.collection(REQUESTS_COLLECTION).doc(requestId);
  const snap = await docRef.get();
  if (!snap.exists) {
    throw new AppError("not-found", "El pedido no existe.");
  }
  const current = snap.data();
  assertStatus(current.status, ["queued"]);

  const currentVariantIds = new Set(current.items.map((item) => item.variantId));
  for (const override of items) {
    if (!currentVariantIds.has(override.variantId)) {
      throw new AppError(
        "invalid-argument",
        "Una de las variantes despachadas no pertenece a este pedido.",
      );
    }
  }
  const overrides = new Map(items.map((item) => [item.variantId, item]));

  const updatedItems = current.items.map((item) => {
    const override = overrides.get(item.variantId);
    const dispatchedQty = override ? override.dispatchedQty : item.requestedQty;
    const dispatchNote = override && override.dispatchNote ? override.dispatchNote.trim() : null;

    if (dispatchedQty !== item.requestedQty && !dispatchNote) {
      throw new AppError(
        "invalid-argument",
        `"${item.productName}" tiene una cantidad distinta a la pedida (${item.requestedQty}) — agrega una nota explicando por qué.`,
      );
    }

    return {
      ...item,
      dispatchedQty,
      ...(dispatchNote ? { dispatchNote } : {}),
    };
  });

  const now = FieldValue.serverTimestamp();
  await docRef.update({
    status: "dispatched",
    items: updatedItems,
    dispatchedAt: now,
    dispatchedBy: uid,
    updatedAt: now,
    updatedBy: uid,
  });

  await notifyRestockEvent("restock_dispatched", { items: updatedItems }, requestId);

  return { id: requestId };
}

/**
 * cafetería only, and only the request's own creator. Precondition:
 * status == 'dispatched'. Increments `variants.stock` server-side inside a
 * transaction, atomically with the status change.
 */
async function confirmReceipt(uid, role, payload) {
  await requireRole(uid, "cafeteria");

  const { requestId } = payload || {};
  nonEmptyString(requestId, "El pedido");

  const db = getFirestore();
  const docRef = db.collection(REQUESTS_COLLECTION).doc(requestId);

  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(docRef);
    if (!snap.exists) {
      throw new AppError("not-found", "El pedido no existe.");
    }
    const current = snap.data();
    if (current.requestedBy !== uid) {
      throw new AppError("permission-denied", "Solo quien creó el pedido puede confirmar la recepción.");
    }
    assertStatus(current.status, ["dispatched"]);

    const variantRefs = current.items.map((item) => db.collection(VARIANTS_COLLECTION).doc(item.variantId));
    const variantSnaps = await Promise.all(variantRefs.map((ref) => transaction.get(ref)));

    variantSnaps.forEach((variantSnap, index) => {
      if (!variantSnap.exists) {
        const item = current.items[index];
        throw new AppError(
          "failed-precondition",
          `"${item.productName}" ya no existe en el catálogo — no se puede confirmar la recepción sin corregir el stock manualmente.`,
        );
      }
    });

    const now = FieldValue.serverTimestamp();
    variantSnaps.forEach((variantSnap, index) => {
      const item = current.items[index];
      const currentStock = variantSnap.data().stock;
      const increment = typeof item.dispatchedQty === "number" ? item.dispatchedQty : item.requestedQty;
      transaction.update(variantRefs[index], {
        stock: (typeof currentStock === "number" ? currentStock : 0) + increment,
        updatedAt: now,
        updatedBy: uid,
      });
    });

    transaction.update(docRef, {
      status: "received",
      receivedAt: now,
      receivedBy: uid,
      updatedAt: now,
      updatedBy: uid,
    });
  });

  await notifyRestockEvent("restock_received", {}, requestId);

  return { id: requestId };
}

module.exports = {
  createRestockRequest,
  editPendingRequest,
  acceptRestockRequest,
  rejectRestockRequest,
  dispatchRestockRequest,
  confirmReceipt,
};
