/**
 * Maps Firebase Auth error codes to user-facing Spanish messages.
 *
 * Shared between the password and email-link flows (`Login`,
 * `FinishSignIn`) so error copy stays consistent in one place.
 */

interface FirebaseAuthErrorLike {
  code?: unknown
}

function getErrorCode(error: unknown): string | null {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as FirebaseAuthErrorLike).code === 'string'
  ) {
    return (error as { code: string }).code
  }
  return null
}

const MESSAGES: Record<string, string> = {
  'auth/invalid-email': 'El correo electrónico no es válido.',
  'auth/user-disabled': 'Esta cuenta ha sido deshabilitada. Contacta al administrador.',
  'auth/user-not-found': 'No existe una cuenta con este correo.',
  'auth/wrong-password': 'Contraseña incorrecta.',
  'auth/invalid-credential': 'Correo o contraseña incorrectos.',
  'auth/invalid-login-credentials': 'Correo o contraseña incorrectos.',
  'auth/missing-password': 'Ingresa tu contraseña.',
  'auth/too-many-requests':
    'Demasiados intentos fallidos. Espera unos minutos e intenta de nuevo.',
  'auth/network-request-failed': 'Error de red. Verifica tu conexión e intenta de nuevo.',
  'auth/expired-action-code': 'El enlace expiró. Solicita uno nuevo desde la pantalla de inicio de sesión.',
  'auth/invalid-action-code': 'El enlace no es válido o ya fue usado. Solicita uno nuevo.',
  'auth/user-token-expired': 'Tu sesión expiró. Vuelve a iniciar sesión.',
}

const DEFAULT_MESSAGE = 'Ocurrió un error. Intenta de nuevo.'

export function mapAuthError(error: unknown): string {
  const code = getErrorCode(error)
  if (code && MESSAGES[code]) {
    return MESSAGES[code]
  }
  return DEFAULT_MESSAGE
}
