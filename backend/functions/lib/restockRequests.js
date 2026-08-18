/**
 * The 6 `restock_requests` lifecycle callables.
 *
 * Contract (param/response shape, state machine, precondition rules) comes
 * from `frontend/src/services/firebase/restockRequests.ts` — that file is
 * the spec. Read it before changing anything here.
 *
 * State machine:
 *   pending --accept (production)--> queued --dispatch (production)--> dispatched --confirmReceipt (cafeteria)--> received
 *      |
 *      +--edit (cafeteria, only while pending)
 *      +--reject (production, ONLY from pending, reason required) --> rejected [terminal]
 *
 * `reject` is intentionally not offered from `queued` — matches
 * `rejectRestockRequest`'s doc comment on the client and `QueuePage.tsx`,
 * which never renders a reject action. If that needs to change, it's a
 * product decision, not something to assume here.
 *
 * Ownership: `editPendingRequest` and `confirmReceipt` are restricted to
 * the user who created the request (`requestedBy === uid`), mirroring how
 * `RequestsPage.tsx` already filters to `ownRequests` client-side. This is
 * an inference, not something stated explicitly in the client contract —
 * flagged in the changelog, revisit if cafetería is meant to work off a
 * shared queue instead of "my requests."
 */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const {
  requireAuth,
  requireRole,
  nonEmptyString,
  assertStatus,
  validateRequestedItemsInput,
  validateDispatchItemsInput,
} = require("./validation");
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
      throw new HttpsError("invalid-argument", "Una de las variantes del pedido ya no existe.");
    }
    const variant = variantSnap.data();
    if (!variant.active) {
      throw new HttpsError(
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
const createRestockRequest = onCall(async (request) => {
  const uid = requireAuth(request);
  await requireRole(uid, "cafeteria");

  const items = request.data && request.data.items;
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
});

/** cafetería only, and only the request's own creator. Precondition: status == 'pending'. */
const editPendingRequest = onCall(async (request) => {
  const uid = requireAuth(request);
  await requireRole(uid, "cafeteria");

  const { requestId, items } = request.data || {};
  nonEmptyString(requestId, "El pedido");
  validateRequestedItemsInput(items);

  const db = getFirestore();
  const docRef = db.collection(REQUESTS_COLLECTION).doc(requestId);
  const snap = await docRef.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "El pedido no existe.");
  }
  const current = snap.data();
  if (current.requestedBy !== uid) {
    throw new HttpsError("permission-denied", "Solo quien creó el pedido puede editarlo.");
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
});

/** producción only. Precondition: status == 'pending'. */
const acceptRestockRequest = onCall(async (request) => {
  const uid = requireAuth(request);
  await requireRole(uid, "production");

  const { requestId } = request.data || {};
  nonEmptyString(requestId, "El pedido");

  const db = getFirestore();
  const docRef = db.collection(REQUESTS_COLLECTION).doc(requestId);
  const snap = await docRef.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "El pedido no existe.");
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
});

/** producción only. Precondition: status == 'pending' (NOT 'queued' — see module doc comment). `reason` must be non-empty. */
const rejectRestockRequest = onCall(async (request) => {
  const uid = requireAuth(request);
  await requireRole(uid, "production");

  const { requestId, reason } = request.data || {};
  nonEmptyString(requestId, "El pedido");
  const trimmedReason = nonEmptyString(reason, "El motivo del rechazo");

  const db = getFirestore();
  const docRef = db.collection(REQUESTS_COLLECTION).doc(requestId);
  const snap = await docRef.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "El pedido no existe.");
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
});

/**
 * producción only. Precondition: status == 'queued'. Items omitted from
 * `items` are assumed fully dispatched (dispatchedQty = requestedQty) —
 * `DispatchForm` currently always sends every row, but the omission
 * fallback is part of the documented client contract, so it's honored
 * here regardless.
 */
const dispatchRestockRequest = onCall(async (request) => {
  const uid = requireAuth(request);
  await requireRole(uid, "production");

  const { requestId, items } = request.data || {};
  nonEmptyString(requestId, "El pedido");
  validateDispatchItemsInput(items);

  const db = getFirestore();
  const docRef = db.collection(REQUESTS_COLLECTION).doc(requestId);
  const snap = await docRef.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "El pedido no existe.");
  }
  const current = snap.data();
  assertStatus(current.status, ["queued"]);

  const currentVariantIds = new Set(current.items.map((item) => item.variantId));
  for (const override of items) {
    if (!currentVariantIds.has(override.variantId)) {
      throw new HttpsError(
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
      throw new HttpsError(
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
});

/**
 * cafetería only, and only the request's own creator. Precondition:
 * status == 'dispatched'. Increments `variants.stock` server-side inside a
 * transaction, atomically with the status change — same "golden rule"
 * pattern as `registerSale`/`registerWaste` in `movements.ts`.
 */
const confirmReceipt = onCall(async (request) => {
  const uid = requireAuth(request);
  await requireRole(uid, "cafeteria");

  const { requestId } = request.data || {};
  nonEmptyString(requestId, "El pedido");

  const db = getFirestore();
  const docRef = db.collection(REQUESTS_COLLECTION).doc(requestId);

  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(docRef);
    if (!snap.exists) {
      throw new HttpsError("not-found", "El pedido no existe.");
    }
    const current = snap.data();
    if (current.requestedBy !== uid) {
      throw new HttpsError("permission-denied", "Solo quien creó el pedido puede confirmar la recepción.");
    }
    assertStatus(current.status, ["dispatched"]);

    const variantRefs = current.items.map((item) => db.collection(VARIANTS_COLLECTION).doc(item.variantId));
    const variantSnaps = await Promise.all(variantRefs.map((ref) => transaction.get(ref)));

    variantSnaps.forEach((variantSnap, index) => {
      if (!variantSnap.exists) {
        const item = current.items[index];
        throw new HttpsError(
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
});

module.exports = {
  createRestockRequest,
  editPendingRequest,
  acceptRestockRequest,
  rejectRestockRequest,
  dispatchRestockRequest,
  confirmReceipt,
};
