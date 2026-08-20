/**
 * Light/dark theme switch. `index.css` defines the light palette on bare
 * `:root` and a full dark override under `:root[data-theme='dark']` — this
 * provider is the only thing that ever sets that attribute (on
 * `<html>`, via `document.documentElement.dataset.theme`), and persists the
 * choice in localStorage so a reload doesn't flash back to light.
 *
 * Deliberately NOT wired to `prefers-color-scheme` — this is a manual
 * toggle (`ThemeToggle`, in both panel topbars and on `/login`), defaulting
 * to light for a first-time visitor rather than guessing from the OS.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ThemeContext, type Theme } from '../hooks/useTheme'

const STORAGE_KEY = 'theme'

function getInitialTheme(): Theme {
  return window.localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light'
}

export function ThemeProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
  }, [])

  const contextValue = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme])

  return <ThemeContext.Provider value={contextValue}>{children}</ThemeContext.Provider>
}
