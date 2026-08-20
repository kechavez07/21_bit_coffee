import { useTheme } from '../hooks/useTheme'

/** Label says what clicking it does (switch to the OTHER theme), not the current state — same convention as "Desactivar"/"Reactivar" elsewhere in this app. */
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()

  return (
    <button
      type="button"
      className="btn btn-secondary btn-small"
      onClick={toggleTheme}
      aria-label={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
    >
      {theme === 'dark' ? 'Claro' : 'Oscuro'}
    </button>
  )
}
