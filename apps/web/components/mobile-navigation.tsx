"use client"

import { Show } from "@clerk/nextjs"
import { ListIcon, XIcon } from "@phosphor-icons/react"
import { Button } from "@astreex/ui/components/button"
import Link from "next/link"
import { useEffect, useId, useRef, useState } from "react"

import { publicNavigationLinks } from "@/lib/site-navigation"

type MobileNavigationProps = {
  clerkEnabled: boolean
}

function AccessLinks({ close }: { close: () => void }) {
  return (
    <div className="border-border mt-2 grid grid-cols-2 gap-2 border-t pt-3">
      <Link
        href="/sign-in"
        onClick={close}
        className="border-border text-foreground hover:bg-accent hover:text-accent-foreground rounded-md border px-3 py-2 text-center text-sm font-medium transition-colors"
      >
        Sign in
      </Link>
      <Link
        href="/sign-up"
        onClick={close}
        className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-3 py-2 text-center text-sm font-medium transition-colors"
      >
        Get started
      </Link>
    </div>
  )
}

function DashboardLink({ close }: { close: () => void }) {
  return (
    <div className="border-border mt-2 border-t pt-3">
      <Link
        href="/app"
        onClick={close}
        className="bg-primary text-primary-foreground hover:bg-primary/90 block rounded-md px-3 py-2 text-center text-sm font-medium transition-colors"
      >
        Open dashboard
      </Link>
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
        {open ? (
          <XIcon aria-hidden="true" className="size-5" />
        ) : (
          <ListIcon aria-hidden="true" className="size-5" />
        )}
      </Button>

      {open && (
        <nav
          id={navigationId}
          aria-label="Mobile navigation"
          className="border-border bg-popover text-popover-foreground absolute top-[calc(100%+0.5rem)] right-0 w-64 rounded-lg border p-3 shadow-md"
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
