/**
 * Firestore security rules tests for `../firestore.rules`.
 *
 * Requires the Firestore emulator already running on 127.0.0.1:8090 (see
 * `../firebase.json` / `CI=true firebase emulators:start --only
 * firestore,functions,auth` from `backend/`). Runs against an isolated
 * test project id, so it never touches the seeded `bit-coffee-668f6` data
 * from `functions/seed-emulator.js`.
 *
 * Run: `npm run test:rules` from `backend/`.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require("@firebase/rules-unit-testing");
const {
  doc,
  setDoc,
  updateDoc,
  getDocs,
  collection,
  serverTimestamp,
} = require("firebase/firestore");

const PROJECT_ID = "rules-test-21-bit-coffee";
const RULES_PATH = path.join(__dirname, "..", "firestore.rules");

let testEnv;

test.before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync(RULES_PATH, "utf8"),
      host: "127.0.0.1",
      port: 8090,
    },
  });
});

test.after(async () => {
  await testEnv.cleanup();
});

test.beforeEach(async () => {
  await testEnv.clearFirestore();
});

const CAFE_UID = "cafe-uid";
const PROD_UID = "prod-uid";
const OTHER_CAFE_UID = "cafe-uid-2";

/** Seeds `users/{uid}` docs + a base product/variant, bypassing rules (setup, not what's under test). */
async function seedBaseline() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "users", CAFE_UID), { email: "cafe@test.local", role: "cafeteria" });
    await setDoc(doc(db, "users", OTHER_CAFE_UID), { email: "cafe2@test.local", role: "cafeteria" });
    await setDoc(doc(db, "users", PROD_UID), { email: "prod@test.local", role: "production" });
    await setDoc(doc(db, "products", "prod1"), {
      name: "Galleta",
      description: null,
      category: "galletas",
      active: true,
      createdAt: serverTimestamp(),
      createdBy: CAFE_UID,
      updatedAt: serverTimestamp(),
      updatedBy: CAFE_UID,
    });
    await setDoc(doc(db, "variants", "var1"), {
      productId: "prod1",
      flavor: "Chocolate",
      stock: 50,
      minStockAlert: 10,
      active: true,
      createdAt: serverTimestamp(),
      createdBy: CAFE_UID,
      updatedAt: serverTimestamp(),
      updatedBy: CAFE_UID,
    });
  });
}

function cafeDb() {
  return testEnv.authenticatedContext(CAFE_UID).firestore();
}
function otherCafeDb() {
  return testEnv.authenticatedContext(OTHER_CAFE_UID).firestore();
}
function prodDb() {
  return testEnv.authenticatedContext(PROD_UID).firestore();
}

// ---- products ---------------------------------------------------------

test("cafetería can create a valid product", async () => {
  await seedBaseline();
  const db = cafeDb();
  await assertSucceeds(
    setDoc(doc(db, "products", "p2"), {
      name: "Medialuna",
      description: null,
      category: "panaderia",
      active: true,
      createdAt: serverTimestamp(),
      createdBy: CAFE_UID,
      updatedAt: serverTimestamp(),
      updatedBy: CAFE_UID,
    }),
  );
});

test("producción cannot create a product", async () => {
  await seedBaseline();
  const db = prodDb();
  await assertFails(
    setDoc(doc(db, "products", "p2"), {
      name: "Medialuna",
      description: null,
      category: "panaderia",
      active: true,
      createdAt: serverTimestamp(),
      createdBy: PROD_UID,
      updatedAt: serverTimestamp(),
      updatedBy: PROD_UID,
    }),
  );
});

test("both roles can read products", async () => {
  await seedBaseline();
  await assertSucceeds(getDocs(collection(cafeDb(), "products")));
  await assertSucceeds(getDocs(collection(prodDb(), "products")));
});

test("producción cannot read blocked before auth — unauthenticated read fails", async () => {
  await seedBaseline();
  const anon = testEnv.unauthenticatedContext().firestore();
  await assertFails(getDocs(collection(anon, "products")));
});

// ---- variants -----------------------------------------------------------

test("cafetería catalog-field update cannot also touch stock", async () => {
  await seedBaseline();
  const db = cafeDb();
  await assertFails(
    updateDoc(doc(db, "variants", "var1"), {
      flavor: "Vainilla",
      stock: 999,
      updatedAt: serverTimestamp(),
      updatedBy: CAFE_UID,
    }),
  );
});

test("cafetería catalog-field update without stock succeeds", async () => {
  await seedBaseline();
  const db = cafeDb();
  await assertSucceeds(
    updateDoc(doc(db, "variants", "var1"), {
      flavor: "Vainilla",
      minStockAlert: 5,
      active: true,
      updatedAt: serverTimestamp(),
      updatedBy: CAFE_UID,
    }),
  );
});

test("cafetería stock-only update succeeds", async () => {
  await seedBaseline();
  const db = cafeDb();
  await assertSucceeds(
    updateDoc(doc(db, "variants", "var1"), {
      stock: 45,
      updatedAt: serverTimestamp(),
      updatedBy: CAFE_UID,
    }),
  );
});

test("producción cannot update variant stock", async () => {
  await seedBaseline();
  const db = prodDb();
  await assertFails(
    updateDoc(doc(db, "variants", "var1"), {
      stock: 0,
      updatedAt: serverTimestamp(),
      updatedBy: PROD_UID,
    }),
  );
});

test("variant create rejects a productId that doesn't exist", async () => {
  await seedBaseline();
  const db = cafeDb();
  await assertFails(
    setDoc(doc(db, "variants", "var-orphan"), {
      productId: "does-not-exist",
      flavor: "Fresa",
      stock: 10,
      minStockAlert: 2,
      active: true,
      createdAt: serverTimestamp(),
      createdBy: CAFE_UID,
      updatedAt: serverTimestamp(),
      updatedBy: CAFE_UID,
    }),
  );
});

// ---- restock_requests (mirrors the state machine — see rules file comment) --

async function seedPendingRequest(requestedBy = CAFE_UID) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "restock_requests", "r1"), {
      requestedBy,
      status: "pending",
      items: [{ variantId: "var1", productId: "prod1", productName: "Galleta", flavor: "Chocolate", currentStockAtRequest: 50, requestedQty: 5 }],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
}

async function seedQueuedRequest() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "restock_requests", "r1"), {
      requestedBy: CAFE_UID,
      status: "queued",
      items: [{ variantId: "var1", productId: "prod1", productName: "Galleta", flavor: "Chocolate", currentStockAtRequest: 50, requestedQty: 5 }],
      createdAt: serverTimestamp(),
      acceptedAt: serverTimestamp(),
      acceptedBy: PROD_UID,
      updatedAt: serverTimestamp(),
    });
  });
}

test("cafetería can create a pending restock request for herself", async () => {
  await seedBaseline();
  const db = cafeDb();
  await assertSucceeds(
    setDoc(doc(db, "restock_requests", "r2"), {
      requestedBy: CAFE_UID,
      status: "pending",
      items: [{ variantId: "var1", productId: "prod1", productName: "Galleta", flavor: "Chocolate", currentStockAtRequest: 50, requestedQty: 5 }],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );
});

test("producción cannot create a restock request", async () => {
  await seedBaseline();
  const db = prodDb();
  await assertFails(
    setDoc(doc(db, "restock_requests", "r2"), {
      requestedBy: PROD_UID,
      status: "pending",
      items: [{ variantId: "var1", productId: "prod1", productName: "Galleta", flavor: "Chocolate", currentStockAtRequest: 50, requestedQty: 5 }],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );
});

test("producción accepting a pending request (pending -> queued) succeeds", async () => {
  await seedBaseline();
  await seedPendingRequest();
  const db = prodDb();
  await assertSucceeds(
    updateDoc(doc(db, "restock_requests", "r1"), {
      status: "queued",
      acceptedAt: serverTimestamp(),
      acceptedBy: PROD_UID,
      updatedAt: serverTimestamp(),
    }),
  );
});

test("producción rejecting an already-queued request fails — mirrors the callable's precondition (pending only)", async () => {
  await seedBaseline();
  await seedQueuedRequest();
  const db = prodDb();
  await assertFails(
    updateDoc(doc(db, "restock_requests", "r1"), {
      status: "rejected",
      rejectedAt: serverTimestamp(),
      rejectedBy: PROD_UID,
      rejectionReason: "no debería poder",
      updatedAt: serverTimestamp(),
    }),
  );
});

test("cafetería cannot edit a pending request that isn't her own", async () => {
  await seedBaseline();
  await seedPendingRequest(CAFE_UID);
  const db = otherCafeDb();
  await assertFails(
    updateDoc(doc(db, "restock_requests", "r1"), {
      items: [{ variantId: "var1", productId: "prod1", productName: "Galleta", flavor: "Chocolate", currentStockAtRequest: 50, requestedQty: 9 }],
      requestedBy: CAFE_UID,
      updatedAt: serverTimestamp(),
    }),
  );
});

test("producción cannot skip straight from pending to dispatched", async () => {
  await seedBaseline();
  await seedPendingRequest();
  const db = prodDb();
  await assertFails(
    updateDoc(doc(db, "restock_requests", "r1"), {
      status: "dispatched",
      dispatchedAt: serverTimestamp(),
      dispatchedBy: PROD_UID,
      updatedAt: serverTimestamp(),
    }),
  );
});

// ---- comments -------------------------------------------------------------

test("a user can comment with their own uid and real role", async () => {
  await seedBaseline();
  await seedPendingRequest();
  const db = cafeDb();
  await assertSucceeds(
    setDoc(doc(collection(db, "restock_requests", "r1", "comments")), {
      authorUid: CAFE_UID,
      authorRole: "cafeteria",
      text: "¿cuándo llega?",
      createdAt: serverTimestamp(),
    }),
  );
});

test("a user cannot post a comment impersonating another uid", async () => {
  await seedBaseline();
  await seedPendingRequest();
  const db = cafeDb();
  await assertFails(
    setDoc(doc(collection(db, "restock_requests", "r1", "comments")), {
      authorUid: PROD_UID,
      authorRole: "cafeteria",
      text: "suplantando a otro usuario",
      createdAt: serverTimestamp(),
    }),
  );
});

test("a user cannot lie about their role in a comment", async () => {
  await seedBaseline();
  await seedPendingRequest();
  const db = cafeDb();
  await assertFails(
    setDoc(doc(collection(db, "restock_requests", "r1", "comments")), {
      authorUid: CAFE_UID,
      authorRole: "production",
      text: "mintiendo sobre el rol",
      createdAt: serverTimestamp(),
    }),
  );
});

// ---- out of scope, confirm still blocked (H-02) ----------------------------

test("sales collection is still fully blocked (H-02, out of scope for this pass)", async () => {
  await seedBaseline();
  const db = cafeDb();
  await assertFails(
    setDoc(doc(db, "sales", "s1"), {
      variantId: "var1",
      quantity: 1,
      registeredBy: CAFE_UID,
      timestamp: serverTimestamp(),
    }),
  );
});
