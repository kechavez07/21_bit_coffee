/**
 * `useToast` + the context it reads — split from `ToastProvider.tsx` so
 * that file only exports the component (keeps Fast Refresh happy; a file
 * exporting both a component and a hook breaks it).
 */
import { createContext, useContext } from 'react'

export type ToastVariant = 'success' | 'error' | 'info'

export interface ToastContextValue {
  showToast: (variant: ToastVariant, message: string) => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)

/** Throws if called outside `ToastProvider` — every page in this app is (see `App.tsx`), so this is a real programming-error guard, not a runtime possibility. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return ctx
}
