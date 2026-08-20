/**
 * Express server entry point — replaces `backend/functions/index.js`
 * (Cloud Functions) as the compute layer for the `restock_requests`
 * lifecycle. Firestore/Auth/FCM stay on Firebase as-is; this only hosts
 * the 6 routes that used to be `onCall` callables.
 *
 * `initializeFirebaseAdmin()` runs first, before any route module touches
 * `admin.auth()`/`getFirestore()`/`getMessaging()` — same init-order care
 * as the old `functions/index.js`, now explicit instead of implicit.
 */
require("dotenv").config();

const { initializeFirebaseAdmin } = require("./src/firebaseAdmin");
initializeFirebaseAdmin();

const express = require("express");
const cors = require("cors");
const { authenticate } = require("./src/middleware/auth");
const restockRequestsRouter = require("./src/routes/restockRequests");
const { corsOriginValidator } = require("./src/lib/cors");

const app = express();

app.use(cors({ origin: corsOriginValidator(process.env.ALLOWED_ORIGIN) }));
app.use(express.json());

// Unauthenticated — Render's health check hits this.
app.get("/health", (req, res) => {
  res.status(200).json({ ok: true });
});

app.use("/", authenticate, restockRequestsRouter);

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`21 Bit Coffee API listening on :${PORT}`);
});
