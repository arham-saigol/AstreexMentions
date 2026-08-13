"use client"

import { Moon, Sun } from "lucide-react"
import { useSyncExternalStore } from "react"

import { Button } from "@astreex/ui/components/button"
import { useTheme } from "@astreex/ui/theme-provider"

/**
 * Theme switcher for the signed-in app. Marketing renders none — the site
 * follows the OS. The icon waits for the client snapshot (via
 * useSyncExternalStore) so it never hydrates against the SSR default before the
 * no-flash script's value is known.
 */
const subscribeNoop = () => () => {}

function useIsMounted() {
  return useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  )
}

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme()
  const mounted = useIsMounted()
  const next = theme === "dark" ? "light" : "dark"

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={toggle}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className={className}
    >
      {mounted ? (
        theme === "dark" ? (
          <Sun aria-hidden="true" />
        ) : (
          <Moon aria-hidden="true" />
        )
      ) : (
        <span aria-hidden="true" className="size-[15px]" />
      )}
    </Button>
  )
}