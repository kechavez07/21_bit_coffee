import type { ReactNode } from 'react'
import { BrandMark } from './BrandMark'
import './FullScreenStatus.css'
import '../styles/forms.css'

export interface FullScreenStatusProps {
  variant?: 'loading' | 'info' | 'error'
  title: string
  description?: string
  action?: ReactNode
  /** Show the brand seal above the title. Only for screens with no panel
   * topbar of their own (route-guard states) — pages nested inside
   * `CafeteriaLayout`/`ProductionLayout` already show it there. */
  showBrand?: boolean
}

/**
 * Full-viewport status screen used for the states that sit outside any
 * "real" page: session loading, auth errors, and the unauthorized-account
 * screen. Keeps that visual language in one place instead of repeating
 * spinner/markup per route guard.
 */
export function FullScreenStatus({
  variant = 'info',
  title,
  description,
  action,
  showBrand = false,
}: FullScreenStatusProps) {
  return (
    <div className="status-screen" role={variant === 'error' ? 'alert' : 'status'}>
      {showBrand && <BrandMark />}
      {variant === 'loading' && <div className="spinner" aria-hidden="true" />}
      <h1>{title}</h1>
      {description && <p>{description}</p>}
      {action}
    </div>
  )
}
