# Development Plan — Cafeteria/Production Inventory System

Stack: **React + Vite + PWA** (frontend) · **Firebase / Firestore + Cloud Functions + FCM** (backend).

This project is built with Claude Code using 3 subagents defined in `.claude/agents/`:

- **`frontend-developer`** — UI, screens, PWA.
- **`backend-firebase`** — Firestore, security rules, transactions, Cloud Functions, FCM.
- **`testing-qa`** — testing, edge cases, end-to-end validation.

---

## 🔍 Business flow summary

1. **Production** creates the product catalog with variants (e.g. Cookie → Chocolate / Vanilla). Each variant has its own stock.
2. **Cafeteria** (admin) registers what was **sold** (never what's left over). Stock is decremented automatically.
3. **Cafeteria** registers **waste** (damaged/spoiled) and stock is decremented automatically.
4. When stock is low, **Cafeteria** taps "Request restock".
5. **Production** gets a **real-time push notification**, sees Cafeteria's current stock, and physically ships the product (no "confirm shipment" button in-app — just the alert).
6. Both roles log in through the same web portal but see completely different panels.

---

## 🧱 Firestore data model (NoSQL)

*Owned by: `backend-firebase`*

| Collection | Document | Key fields |
|---|---|---|
| `users` | `{uid}` | `email`, `role` (`"cafeteria"` \| `"production"`), `fcmToken` |
| `products` | `{productId}` | `name`, `category`, `imageUrl`, `createdAt` |
| `variants` | `{variantId}` | `productId` (ref), `flavor`, `price`, `stock` (int), `minStockAlert` |
| `sales` | `{autoId}` | `variantId`, `quantity`, `registeredBy` (uid), `timestamp` |
| `merma` | `{autoId}` | `variantId`, `quantity`, `reason?`, `registeredBy`, `timestamp` |
| `restock_requests` | `{autoId}` | `requestedBy`, `items: [{variantId, name, currentStock, requestedQty}]`, `status` (`"pending"` \| `"seen"`), `timestamp` |

**Golden rule:** stock lives inside the `variants` document. Every sale or waste entry must go through a **Firestore transaction** that decrements stock atomically (prevents two simultaneous writes from clobbering each other).

---

## 🖥️ Modules and screens

### 🔐 Module 1 — Authentication (Login)
*Frontend: `frontend-developer` · Rules/roles: `backend-firebase`*
- Single login screen (email/password, Firebase Auth).
- Redirect based on `role` (Cafeteria / Production).

### ☕ Module 2 — Cafeteria panel (Admin)
*Frontend: `frontend-developer` · Transactions: `backend-firebase`*
- **Dashboard**: total stock and low-stock items.
- **Register sale**: variant selector + quantity sold → "Register sale" button (decrements stock, writes to `sales`).
- **Register waste**: variant selector + quantity → "Discard" button (decrements stock, writes to `merma`).
- **Request restock**: list of variants with current stock, per-item checkbox or a "Request everything below minimum" button → creates a `restock_requests` document and triggers the push notification.

### 🏭 Module 3 — Production panel
*Frontend: `frontend-developer` · Rules/CRUD: `backend-firebase`*
- **Dashboard**: Cafeteria's stock, read-only.
- **Catalog management (CRUD)**: create/edit/delete `products` and `variants` (initial stock, price).
- **Notifications/requests inbox**: list of pending `restock_requests`, detail view on click, "Mark as seen" button (sets `status` to `"seen"`).

---

## 📲 Push notification strategy (FCM)

*Functions/backend: `backend-firebase` · Client permissions/UI: `frontend-developer`*

1. On login, the PWA requests notification permission.
2. The `fcmToken` is saved to `users/{uid}` (only for the `production` role).
3. When a `restock_request` is created, a **Cloud Function** finds all `production` users' tokens and sends a push: title *"New restock request!"*, body with the details.
4. Fallback: a real-time Firestore listener keeps the inbox updated even if push fails or the tab was already open.

---

## 📅 Development phases (4–6 weeks)

| Phase | Module / Task | Agents involved |
|---|---|---|
| **Phase 0** | Initial setup: React+Vite project, Firebase SDK, Firestore/Auth/FCM, PWA manifest | `backend-firebase` (Firebase project, base rules) + `frontend-developer` (Vite project, PWA) |
| **Phase 1** | Authentication and roles: login, save role, protected routes | `backend-firebase` (`users` model, rules) + `frontend-developer` (login screen, routes) |
| **Phase 2** | Catalog (Production only): CRUD for `products` and `variants` | `backend-firebase` (rules, services) + `frontend-developer` (CRUD screens) |
| **Phase 3** | Sales and waste registration: stock transactions, history | `backend-firebase` (atomic transactions) + `frontend-developer` (forms, history) + `testing-qa` (concurrency, edge cases) |
| **Phase 4** | Real-time stock and restock requests | `backend-firebase` (`restock_requests` service) + `frontend-developer` (real-time dashboard, form) |
| **Phase 5** | Push notifications | `backend-firebase` (Cloud Function, FCM) + `frontend-developer` (permissions, UI) + `testing-qa` (delivery, fallback) |
| **Phase 6** | Production panel (receiving): read-only stock, mark as seen | `frontend-developer` (view) + `backend-firebase` (`status` update service) |
| **Phase 7** | Integration and PWA testing: full flow on mobile/desktop, PWA install | `testing-qa` (phase lead) + `frontend-developer` / `backend-firebase` (fixes) |

---

## Current status

- [x] Repo initialized, subagents configured in `.claude/agents/`.
- [ ] Phase 0 — Initial setup
- [ ] Phase 1 — Authentication and roles
- [ ] Phase 2 — Catalog
- [ ] Phase 3 — Sales and waste registration
- [ ] Phase 4 — Real-time stock and restock requests
- [ ] Phase 5 — Push notifications
- [ ] Phase 6 — Production panel (receiving)
- [ ] Phase 7 — Integration and PWA testing
