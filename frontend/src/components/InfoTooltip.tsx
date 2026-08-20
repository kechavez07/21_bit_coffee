import { useState } from 'react'
import './InfoTooltip.css'

interface InfoTooltipProps {
  text: string
}

/**
 * Small "i" icon that reveals `text` in a popover — for supplementary
 * info that shouldn't be shown expanded by default (e.g. a product's
 * description in the catalog list). Hover/keyboard-focus are handled
 * entirely by CSS (`:hover`/`:focus-visible` on the trigger revealing its
 * adjacent sibling); `pinned` is only there so a click also works on
 * touch, where hover never fires.
 */
export function InfoTooltip({ text }: Readonly<InfoTooltipProps>) {
  const [pinned, setPinned] = useState(false)

  return (
    <span className={`info-tooltip${pinned ? ' info-tooltip-pinned' : ''}`}>
      <button
        type="button"
        className="info-tooltip-trigger"
        aria-label="Ver descripción"
        onClick={() => setPinned((current) => !current)}
      >
        i
      </button>
      <span className="info-tooltip-popover" role="tooltip">
        {text}
      </span>
    </span>
  )
}
