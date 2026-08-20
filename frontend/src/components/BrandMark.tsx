/**
 * "21 Bit Coffee" wordmark — a circular seal + stacked wordmark, built
 * from CSS/text only (no image asset exists for the brand yet). Used in
 * both panel topbars (small) and the auth card (`size="lg"`).
 */
export function BrandMark({ size = 'md' }: { size?: 'md' | 'lg' }) {
  return (
    <span className={`brand-mark${size === 'lg' ? ' brand-mark-lg' : ''}`}>
      <span className="brand-mark-seal" aria-hidden="true">
        21
      </span>
      <span className="brand-mark-word">
        <strong>Bit Coffee</strong>
        <span>Más que café</span>
      </span>
    </span>
  )
}
