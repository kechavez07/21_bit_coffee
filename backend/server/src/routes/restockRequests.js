/**
 * HTTP routes for the 6 `restock_requests` lifecycle operations.
 *
 * Each route replaces one `onCall` callable from
 * `backend/functions/lib/restockRequests.js`. Response shape on success is
 * exactly `{ id }` (same JSON `httpsCallable`'s `result.data` used to
 * hand back). On error, responds with an HTTP status derived from the
 * `AppError`'s `code` (see `../lib/errors.js`) and
 * `{ error: { code, message } }` — the frontend fetch wrapper
 * (`frontend/src/services/firebase/restockRequests.ts`) throws `new
 * Error(body.error.message)`, so components that already do
 * `err instanceof Error ? err.message : ...` (RequestsPage, QueuePage)
 * need no changes.
 */
const express = require("express");
const { AppError, statusForCode } = require("../lib/errors");
const {
  createRestockRequest,
  editPendingRequest,
  acceptRestockRequest,
  rejectRestockRequest,
  dispatchRestockRequest,
  confirmReceipt,
} = require("../lib/restockRequests");

const router = express.Router();

function handle(fn) {
  return async (req, res) => {
    try {
      const result = await fn(req.uid, req.role, req.body);
      res.json(result);
    } catch (err) {
      if (err instanceof AppError) {
        return res.status(statusForCode(err.code)).json({
          error: { code: err.code, message: err.message },
        });
      }
      console.error(err);
      return res.status(500).json({
        error: { code: "internal", message: "Ocurrió un error inesperado. Intenta de nuevo." },
      });
    }
  };
}

router.post("/createRestockRequest", handle(createRestockRequest));
router.post("/editPendingRequest", handle(editPendingRequest));
router.post("/acceptRestockRequest", handle(acceptRestockRequest));
router.post("/rejectRestockRequest", handle(rejectRestockRequest));
router.post("/dispatchRestockRequest", handle(dispatchRestockRequest));
router.post("/confirmReceipt", handle(confirmReceipt));

module.exports = router;
