/**
 * Auth middleware — the Express equivalent of what `onCall` used to do
 * automatically (populate `request.auth`) for the 6 restock-request
 * routes.
 *
 * Reads `Authorization: Bearer <idToken>`, verifies it with
 * `admin.auth().verifyIdToken()`, then resolves the caller's role by
 * reading `users/{uid}.role` (`getCallerRole`, reused as-is from
 * `../lib/validation.js` — only the uid's source changed: previously
 * `request.auth.uid` from the callable context, now the verified token's
 * `uid`). Attaches `{ uid, role }` to `req` for the route handlers.
 */
const { admin } = require("../firebaseAdmin");
const { getCallerRole } = require("../lib/validation");

const BEARER_PREFIX = "Bearer ";

async function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  if (!header.startsWith(BEARER_PREFIX)) {
    return res.status(401).json({
      error: { code: "unauthenticated", message: "Debes iniciar sesión para hacer esto." },
    });
  }

  const idToken = header.slice(BEARER_PREFIX.length).trim();
  if (!idToken) {
    return res.status(401).json({
      error: { code: "unauthenticated", message: "Debes iniciar sesión para hacer esto." },
    });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.uid = decoded.uid;
    req.role = await getCallerRole(decoded.uid);
    return next();
  } catch (err) {
    return res.status(401).json({
      error: { code: "unauthenticated", message: "Sesión inválida o expirada." },
    });
  }
}

module.exports = { authenticate };
