"use client"

import { Theme } from "@astryxdesign/core"
import { neutralTheme } from "@astryxdesign/theme-neutral/built"
import type { ReactNode } from "react"

/**
 * Mounts the Astryx design system. The root {@link Theme} syncs `data-theme`
 * and `data-astryx-theme` to <html> (covering portals/toast viewports); SSR
 * flash is avoided by also setting those attributes on <html> in the server
 * layout. The neutral theme is paired with theme.css so tokens are present on
 * first paint and {@link Theme} skips runtime injection (built mode).
 */
export function AstryxTheme({ children }: { children: ReactNode }) {
  return (
    <Theme theme={neutralTheme} mode="light">
      {children}
    </Theme>
  )
}
