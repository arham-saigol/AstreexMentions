/**
 * Theme wiring shared between the server root layout (inline no-flash script)
 * and the client {@link ThemeProvider}. Importable from both server and
 * client modules — no React, no "use client".
 */

export const THEME_STORAGE_KEY = "astreex-theme"

export type Theme = "dark" | "light"

/**
 * Inline, pre-paint theme resolver. Runs once before the first paint: it
 * honors an explicit choice stored by the in-app toggle, otherwise follows
 * the OS `prefers-color-scheme`. The result is written to <html data-theme>,
 * which the global CSS uses to select the dark or light token set.
 */
export const themeScript = `(function(){try{var k="${THEME_STORAGE_KEY}";var s=localStorage.getItem(k);var m=window.matchMedia("(prefers-color-scheme: light)");var t=s?s:(m.matches?"light":"dark");document.documentElement.dataset.theme=t;}catch(e){}})();`
