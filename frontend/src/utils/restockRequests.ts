/**
 * Pure restock-request helpers — no React, no Firestore. Same posture as
 * `utils/catalog.ts`'s `CATEGORY_LABELS`: kept framework-free so it's
 * trivially unit-testable and so components that only need a label (not
 * the whole `RestockRequestDetail` component) can import it without
 * pulling in JSX.
 */
import type { RestockRequestStatus } from '../services/firebase/restockRequests'
import type { UserRole } from '../services/firebase/auth'

export const STATUS_LABELS: Record<RestockRequestStatus, string> = {
  pending: 'Pendiente',
  queued: 'En cola',
  rejected: 'Rechazado',
  dispatched: 'Despachado',
  received: 'Recibido',
}

export const ROLE_LABELS: Record<UserRole, string> = {
  cafeteria: 'Cafetería',
  production: 'Pastelería',
}
