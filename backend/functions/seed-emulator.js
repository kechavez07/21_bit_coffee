/**
 * Dev-only seed script for the local Firebase Emulator Suite. NEVER
 * imported by `index.js`, never deployed as a Cloud Function — run
 * directly with `node seed-emulator.js` while the emulators are up
 * (Auth :9099, Firestore :8090, per `backend/firebase.json`).
 *
 * Creates two test accounts (role strings confirmed literal in
 * `lib/validation.js`/`frontend/src/services/firebase/auth.ts`:
 * "cafeteria" and "production" — NOT "pasteleria", that's UI-label-only
 * terminology) and one product+variant with known stock, so there's
 * something real to build a restock request against.
 *
 * Idempotent: re-running it re-uses existing Auth users by email and
 * merges the Firestore `users` doc, but always creates a FRESH
 * product/variant (so re-running doesn't silently mutate stock a
 * previous test run already changed).
 */
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8090";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.GCLOUD_PROJECT = "bit-coffee-668f6";

const admin = require("firebase-admin");
admin.initializeApp({ projectId: "bit-coffee-668f6" });

const TEST_PASSWORD = "Test1234!";

async function upsertUser(email, role) {
  const auth = admin.auth();
  const db = admin.firestore();

  let user;
  try {
    user = await auth.getUserByEmail(email);
  } catch (err) {
    user = await auth.createUser({ email, password: TEST_PASSWORD, emailVerified: true });
  }

  await db.collection("users").doc(user.uid).set({ email, role }, { merge: true });
  return user.uid;
}

async function main() {
  const db = admin.firestore();

  const cafeteriaUid = await upsertUser("test-cafeteria@example.com", "cafeteria");
  const productionUid = await upsertUser("test-produccion@example.com", "production");

  const now = admin.firestore.FieldValue.serverTimestamp();

  const productRef = db.collection("products").doc();
  await productRef.set({
    name: "Galleta de prueba",
    description: "Sembrado por seed-emulator.js — seguro de borrar/editar.",
    category: "galletas",
    active: true,
    createdAt: now,
    createdBy: cafeteriaUid,
    updatedAt: now,
    updatedBy: cafeteriaUid,
  });

  const variantRef = db.collection("variants").doc();
  await variantRef.set({
    productId: productRef.id,
    flavor: "Chocolate",
    stock: 50,
    minStockAlert: 10,
    active: true,
    createdAt: now,
    createdBy: cafeteriaUid,
    updatedAt: now,
    updatedBy: cafeteriaUid,
  });

  const result = {
    cafeteria: { email: "test-cafeteria@example.com", password: TEST_PASSWORD, uid: cafeteriaUid },
    production: { email: "test-produccion@example.com", password: TEST_PASSWORD, uid: productionUid },
    product: { id: productRef.id, name: "Galleta de prueba" },
    variant: { id: variantRef.id, flavor: "Chocolate", stock: 50, minStockAlert: 10 },
  };

  console.log(JSON.stringify(result, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
