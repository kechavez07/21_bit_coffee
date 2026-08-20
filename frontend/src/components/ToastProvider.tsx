/**
 * App-wide toast notifications — success/error/info banners in the bottom
 * right corner, auto-dismissed after a few seconds. Plain React state +
 * CSS, no dependency.
 *
 * Mounted once in `App.tsx` (wraps every route), so any page/component
 * calls `useToast().showToast(variant, message)` without threading a prop
 * down — this is a genuinely cross-cutting concern (catalog actions,
 * movements, restock-request actions, comments all trigger toasts from
 * otherwise-unrelated screens), unlike `NotificationsToggle`'s own local
 * toast, which is scoped to foreground push messages only and stays as-is.
 */
import { useCallback, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ToastContext, type ToastVariant } from '../hooks/useToast'
import './ToastProvider.css'

export type { ToastVariant }

interface ToastItem {
  id: number
  variant: ToastVariant
  message: string
}

const TOAST_DURATION_MS = 3500

export function ToastProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const showToast = useCallback(
    (variant: ToastVariant, message: string) => {
      const id = nextId.current++
      setToasts((current) => [...current, { id, variant, message }])
      window.setTimeout(() => dismiss(id), TOAST_DURATION_MS)
    },
    [dismiss],
  )

  const contextValue = useMemo(() => ({ showToast }), [showToast])

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div className="toast-viewport" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <button
            key={toast.id}
            type="button"
            className={`toast toast-${toast.variant}`}
            onClick={() => dismiss(toast.id)}
          >
            {toast.message}
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
