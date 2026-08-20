/**
 * Builds the `origin` option for the `cors` package.
 *
 * A plain string (what `index.js` used before) makes `cors` echo that
 * exact value on every response regardless of the request's real
 * `Origin` — harmless if the frontend's origin never changes, but Vite
 * auto-increments its port (5173 -> 5174 -> ...) whenever the previous
 * one is still held by an old dev-server process, which happens often in
 * local dev. A fixed `ALLOWED_ORIGIN` then silently stops matching and
 * every request fails preflight with a confusing browser-side CORS error.
 *
 * Fix: pass a function instead. `cors` calls it per-request with the
 * incoming `Origin` header and reflects back only what this approves —
 * this is the package's supported way to allow a set of origins instead
 * of one fixed string (https://github.com/expressjs/cors#configuring-cors-w-dynamic-origin).
 * Because it's always a per-request reflection of a specific `requestOrigin`
 * (never a wildcard), it stays correct even if a future change turns on
 * `credentials: true` — the browser rejects `Access-Control-Allow-Origin:
 * '*'` paired with `Access-Control-Allow-Credentials: true` outright, and
 * this function can never produce `'*'`. Not that it matters today: no
 * request in this app sends cookies or `credentials: 'include'` — auth is
 * a `Authorization: Bearer <idToken>` header (see
 * `frontend/src/services/firebase/restockRequests.ts`'s `callApi`), which
 * needs no CORS credentials mode at all. `cors()` in `index.js` correctly
 * leaves `credentials` unset (defaults to `false`) — flip it only if a
 * future change starts sending cookies cross-origin.
 *
 * `localhost`/`127.0.0.1` on any port is allowed **only outside
 * production** (`NODE_ENV !== 'production'`) — see the gate below. It's
 * not a real security hole even without the gate (a browser only ever
 * sends that `Origin` for a request genuinely made from a page served on
 * localhost; an outside attacker's page can't spoof it), but gating it
 * means a misconfigured/missing `ALLOWED_ORIGIN` in production fails
 * closed instead of silently accepting every local port. Render does NOT
 * set `NODE_ENV` on its own (confirmed against Render's docs — unlike
 * some other platforms, it leaves it unset unless you set it), so
 * `render.yaml` sets `NODE_ENV=production` explicitly for this to work
 * once deployed. Locally (`npm start`/`npm run dev`, both just `node
 * index.js` — see `package.json`), nothing sets `NODE_ENV`, so
 * `process.env.NODE_ENV` is `undefined` there, `undefined !== 'production'`
 * is `true`, and the dev-only rule applies — exactly the intended default.
 *
 * Beyond that, only origins explicitly listed in `ALLOWED_ORIGIN` (comma
 * -separated, for e.g. the real Vercel URL plus a preview-deploy URL)
 * are allowed. Requests with no `Origin` header at all (curl, server-to
 * -server, Render's health check) are always allowed — they aren't
 * subject to CORS in the first place.
 */
const LOCALHOST_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function corsOriginValidator(allowedOriginEnv) {
  const configuredOrigins = (allowedOriginEnv || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const isDev = process.env.NODE_ENV !== "production";

  return function origin(requestOrigin, callback) {
    if (!requestOrigin) {
      return callback(null, true);
    }
    const allowed =
      (isDev && LOCALHOST_ORIGIN.test(requestOrigin)) || configuredOrigins.includes(requestOrigin);
    // `callback(null, false)`, not `callback(new Error(...))` — the latter
    // makes `cors` pass the error to Express's default error handler,
    // which responds 500 with a full stack trace (including local file
    // paths) to whoever sent the disallowed Origin. `false` just omits
    // the CORS headers, which is all that's needed to make the browser
    // block the response.
    return callback(null, allowed);
  };
}

module.exports = { corsOriginValidator };
