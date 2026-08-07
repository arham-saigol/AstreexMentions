"use client"

import { Show } from "@clerk/nextjs"
import { Button } from "@astreex/ui/components/button"
import { Menu, X } from "lucide-react"
import Link from "next/link"
import { useEffect, useId, useRef, useState } from "react"

import { publicNavigationLinks } from "@/lib/site-navigation"

type MobileNavigationProps = {
  clerkEnabled: boolean
}

function AccessLinks({ close }: { close: () => void }) {
  return (
    <div className="border-border mt-2 grid grid-cols-2 gap-2 border-t pt-3">
      <Button asChild size="sm" variant="outline">
        <Link href="/sign-in" onClick={close}>
          Sign in
        </Link>
      </Button>
      <Button asChild size="sm">
        <Link href="/sign-up" onClick={close}>
          Get started
        </Link>
      </Button>
    </div>
  )
}

function DashboardLink({ close }: { close: () => void }) {
  return (
    <div className="border-border mt-2 border-t pt-3">
      <Button asChild size="sm" className="w-full">
        <Link href="/app" onClick={close}>
          Open dashboard
        </Link>
      </Button>
    </div>
  )
}

export function MobileNavigation({ clerkEnabled }: MobileNavigationProps) {
  const [open, setOpen] = useState(false)
  const navigationId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }

    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [open])

  const close = () => setOpen(false)

  return (
    <div ref={containerRef} className="relative lg:hidden">
      <Button
        ref={triggerRef}
        type="button"
        size="icon"
        variant="ghost"
        aria-label={open ? "Close navigation" : "Open navigation"}
        aria-controls={navigationId}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span
          aria-hidden="true"
          className="t-icon-swap"
          data-state={open ? "b" : "a"}
        >
          <Menu className="t-icon size-5" data-icon="a" />
          <X className="t-icon size-5" data-icon="b" />
        </span>
      </Button>

      {open && (
        <nav
          id={navigationId}
          aria-label="Mobile navigation"
          data-state="open"
          data-origin="top-right"
          className="t-dropdown border-border bg-popover text-popover-foreground absolute top-[calc(100%+0.5rem)] right-0 w-64 rounded-lg border p-3 shadow-md"
        >
          <ul className="space-y-1">
            {publicNavigationLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={close}
                  className="hover:bg-accent hover:text-accent-foreground block rounded-md px-3 py-2 text-sm font-medium transition-colors"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>

          {clerkEnabled ? (
            <>
              <Show when="signed-out">
                <AccessLinks close={close} />
              </Show>
              <Show when="signed-in">
                <DashboardLink close={close} />
              </Show>
            </>
          ) : (
            <AccessLinks close={close} />
          )}
        </nav>
      )}
    </div>
  )
}
