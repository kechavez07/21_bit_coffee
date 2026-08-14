/**
 * Maps Firestore error codes to user-facing Spanish messages. Mirrors
 * `authErrorMessages.ts`'s shape but for Firestore reads/writes (catalog
 * CRUD, and later phases' sale/waste/restock writes).
 *
 * Also handles `InsufficientStockError` (see
 * `services/firebase/movements.ts`) — a client-side business-rule
 * rejection thrown *before* any Firestore write, not a `FirestoreError`,
 * but callers still route it through this same function so every write
 * failure in the movements screen gets an equally clear message.
 */

interface FirestoreErrorLike {
  code?: unknown
}

function getErrorCode(error: unknown): string | null {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as FirestoreErrorLike).code === 'string'
  ) {
    return (error as { code: string }).code
  }
  return null
}

const MESSAGES: Record<string, string> = {
  'permission-denied':
    'No se pudo guardar: revisa que los datos sean válidos (categoría, sabor, stock mínimo) e intenta de nuevo.',
  unavailable: 'Error de red. Verifica tu conexión e intenta de nuevo.',
  cancelled: 'La operación fue cancelada. Intenta de nuevo.',
  'deadline-exceeded': 'La operación tardó demasiado. Intenta de nuevo.',
}

const DEFAULT_MESSAGE = 'Ocurrió un error al guardar. Intenta de nuevo.'

export function mapFirestoreError(error: unknown): string {
  if (error instanceof Error && error.name === 'InsufficientStockError') {
    return 'Stock insuficiente: no hay unidades suficientes de esta variante para registrar esta cantidad.'
  }

  const code = getErrorCode(error)
  if (code && MESSAGES[code]) {
    return MESSAGES[code]
  }
  return DEFAULT_MESSAGE
}
