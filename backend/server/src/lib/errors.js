/**
 * Replaces `firebase-functions`' `HttpsError` (Cloud Functions-only) for the
 * Express server. Same `code` vocabulary as `backend/functions/lib/*.js`
 * used with `HttpsError`, so error messages/semantics carry over unchanged
 * — only the transport (HTTP status + JSON body instead of a callable
 * error) differs. See `src/routes/restockRequests.js` for how this maps to
 * a response.
 */
class AppError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const STATUS_BY_CODE = {
  "unauthenticated": 401,
  "permission-denied": 403,
  "invalid-argument": 400,
  "not-found": 404,
  "failed-precondition": 409,
};

function statusForCode(code) {
  return STATUS_BY_CODE[code] || 500;
}

module.exports = { AppError, statusForCode };
