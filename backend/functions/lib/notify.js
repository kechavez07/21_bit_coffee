/**
 * FCM sending for the `restock_requests` lifecycle.
 *
 * 6 event types, each notifying the role that did NOT perform the action —
 * this table is the single source of truth for that mapping and should
 * match PLAN.md / backend-firebase.md exactly. `data.type` is consumed by
 * `frontend/public/firebase-messaging-sw.js`'s `urlForNotificationData` —
 * do not rename these without updating that file too.
 */
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

const EVENT_CONFIG = {
  restock_created: {
    role: "production",
    title: "Nuevo pedido de reposición",
    body: (request) => `Cafetería pidió ${request.items.length} producto(s).`,
  },
  restock_edited: {
    role: "production",
    title: "Pedido de reposición editado",
    body: () => "Cafetería actualizó un pedido pendiente.",
  },
  restock_accepted: {
    role: "cafeteria",
    title: "Pedido aceptado",
    body: () => "Pastelería aceptó tu pedido de reposición.",
  },
  restock_rejected: {
    role: "cafeteria",
    title: "Pedido rechazado",
    body: (_request, extra) => `Pastelería rechazó tu pedido: ${extra.reason}`,
  },
  restock_dispatched: {
    role: "cafeteria",
    title: "Pedido despachado",
    body: () => "Pastelería despachó tu pedido — revisá las cantidades.",
  },
  restock_received: {
    role: "production",
    title: "Recepción confirmada",
    body: () => "Cafetería confirmó la recepción del pedido.",
  },
};

/**
 * Sends the push for one of the 6 lifecycle events to every user of the
 * target role with a registered `fcmToken`. Best effort: a missing/invalid
 * token never fails the calling Cloud Function's write — it's cleaned up
 * here, and the real-time Firestore listener is the documented fallback
 * (see PLAN.md's notification section) if push doesn't arrive at all.
 */
async function notifyRestockEvent(type, request, requestId, extra = {}) {
  const config = EVENT_CONFIG[type];
  if (!config) {
    throw new Error(`Unknown restock notification type: ${type}`);
  }

  const db = getFirestore();
  const usersSnap = await db.collection("users").where("role", "==", config.role).get();

  const tokenToUid = new Map();
  usersSnap.forEach((doc) => {
    const token = doc.data().fcmToken;
    if (typeof token === "string" && token) {
      tokenToUid.set(token, doc.id);
    }
  });

  if (tokenToUid.size === 0) {
    return;
  }

  const tokens = Array.from(tokenToUid.keys());
  const message = {
    tokens,
    notification: {
      title: config.title,
      body: config.body(request, extra),
    },
    data: {
      type,
      requestId,
    },
  };

  const response = await getMessaging().sendEachForMulticast(message);

  const cleanup = [];
  response.responses.forEach((result, index) => {
    if (result.success) return;
    const code = result.error && result.error.code;
    if (
      code === "messaging/invalid-registration-token" ||
      code === "messaging/registration-token-not-registered"
    ) {
      const uid = tokenToUid.get(tokens[index]);
      if (uid) {
        cleanup.push(
          db.collection("users").doc(uid).update({
            fcmToken: FieldValue.delete(),
            fcmTokenUpdatedAt: FieldValue.serverTimestamp(),
          }),
        );
      }
    }
  });

  if (cleanup.length > 0) {
    await Promise.all(cleanup);
  }
}

module.exports = { notifyRestockEvent, EVENT_CONFIG };
