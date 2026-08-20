/**
 * Generic confirm/cancel modal — a controlled wrapper around the native
 * `<dialog>` element. Deliberately not delete-specific (despite its first
 * caller being the catalog's "Eliminar variante" flow, see
 * `pages/cafeteria/CatalogPage.tsx`) — it's reused as-is for the "you're
 * about to change stock from X to Y" confirmation in a later phase, so
 * nothing here should assume "delete" as the only reason to confirm.
 *
 * `open` is a prop, not local state — the dialog's own open/closed-ness is
 * driven by a `ref` + `useEffect` calling `showModal()`/`close()` in sync
 * with it. Native `<dialog>` needs `showModal()` to get the top-layer +
 * `::backdrop` behavior; just toggling the `open` attribute renders it
 * in-flow instead, which is not what we want here.
 *
 * The native `cancel` event (fired on Escape) is the only other way the
 * dialog can close itself, so it's the only other event wired up here:
 * `preventDefault()` stops the browser from closing it out from under
 * React state, then `onCancel` runs so the parent's state stays the single
 * source of truth. There's deliberately no `close` handler alongside it —
 * that would double-fire `onCancel` for a plain button click (which
 * already calls `onCancel` directly) since a native `close` follows either
 * `.close()` or a `cancel` that wasn't prevented.
 */
import { useEffect, useRef } from 'react'
import './ConfirmDialog.css'

export interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialogEl = dialogRef.current
    if (!dialogEl) return

    if (open && !dialogEl.open) {
      dialogEl.showModal()
    } else if (!open && dialogEl.open) {
      dialogEl.close()
    }
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      className="confirm-dialog"
      onCancel={(e) => {
        e.preventDefault()
        onCancel()
      }}
    >
      <h3>{title}</h3>
      {description && <p className="confirm-dialog-description">{description}</p>}
      <div className="confirm-dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </button>
        <button
          type="button"
          className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
          onClick={onConfirm}
          disabled={busy}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  )
}
