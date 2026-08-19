"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"

import { THEME_STORAGE_KEY, type Theme } from "./theme-config"

/**
 * Theme (dark/light) runtime controller.
 *
 * The initial value is already on <html data-theme> before paint — set by the
 * inline no-flash script in the root layout (OS preference, or an explicit
 * choice persisted to localStorage from the in-app toggle). This provider
 * makes that choice reactive: it keeps <html> in sync, exposes a toggle, and
 * follows live OS changes while no explicit choice is stored (so the
 * marketing site, which renders no toggle, tracks the browser).
 */

interface ThemeContextValue {
  theme: Theme
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function readAttribute(): Theme {
  if (typeof document === "undefined") {
    return "dark"
  }

  return document.documentElement.dataset.theme === "light" ? "light" : "dark"
}

function applyTheme(theme: Theme) {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = theme
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readAttribute)

  const toggle = useCallback(() => {
    const value = theme === "dark" ? "light" : "dark"
    setThemeState(value)
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, value)
    } catch {
      /* localStorage may be blocked; the attribute still updates in-memory. */
    }
  }, [theme])

  // Keep <html data-theme> in sync with React state (covers the first mount
  // after SSR, where the no-flash script has already chosen a value).
  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  // Follow the OS preference live while no explicit choice is stored. Once the
  // user toggles (which persists), we stop tracking the OS.
  useEffect(() => {
    const onChange = (event: MediaQueryListEvent) => {
      let explicit = false
      try {
        explicit = Boolean(window.localStorage.getItem(THEME_STORAGE_KEY))
      } catch {
        explicit = false
      }

      if (explicit) {
        return
      }

      setThemeState(event.matches ? "light" : "dark")
    }

    const query = window.matchMedia("(prefers-color-scheme: light)")
    query.addEventListener("change", onChange)
    return () => query.removeEventListener("change", onChange)
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)

  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider")
  }

  return context
}
