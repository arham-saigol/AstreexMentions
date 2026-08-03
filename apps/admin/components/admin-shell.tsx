"use client"

import { UserButton } from "@clerk/nextjs"
import {
  ChartLineUpIcon,
  LightbulbIcon,
  ListIcon,
  NewspaperIcon,
} from "@phosphor-icons/react/dist/ssr"
import { AstreexWordmark } from "@astreex/ui/components/astreex-wordmark"
import { ThemeToggle } from "@astreex/ui/components/theme-toggle"
import { cn } from "@astreex/ui/lib/utils"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useRef, type KeyboardEvent, type ReactNode } from "react"

const navigation = [
  {
    href: "/metrics",
    label: "Metrics",
    description: "Platform and provider health",
    icon: ChartLineUpIcon,
  },
  {
    href: "/feature-requests",
    label: "Feature Requests",
    description: "Customer feedback queue",
    icon: LightbulbIcon,
  },
  {
    href: "/changelog",
    label: "Changelog",
    description: "Draft and publish updates",
    icon: NewspaperIcon,
  },
] as const

function NavigationLinks({
  mobile = false,
  onNavigate,
}: {
  mobile?: boolean
  onNavigate?: () => void
}) {
  const pathname = usePathname()

  return (
    <nav aria-label="Admin navigation" className="space-y-1">
      {navigation.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`)

        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            {...(onNavigate ? { onClick: onNavigate } : {})}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
              mobile && "py-3",
            )}
          >
            <Icon className="size-5" weight={active ? "fill" : "regular"} />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}

function MobileNavigation() {
  const detailsRef = useRef<HTMLDetailsElement>(null)

  function closeNavigation() {
    if (detailsRef.current) {
      detailsRef.current.open = false
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDetailsElement>) {
    if (event.key !== "Escape" || !detailsRef.current?.open) {
      return
    }

    event.preventDefault()
    closeNavigation()
    detailsRef.current.querySelector("summary")?.focus()
  }

  return (
    <details
      ref={detailsRef}
      className="group relative lg:hidden"
      onKeyDown={handleKeyDown}
    >
      <summary className="bg-background text-foreground hover:bg-accent flex size-9 list-none items-center justify-center rounded-md border shadow-xs marker:content-none [&::-webkit-details-marker]:hidden">
        <ListIcon className="size-5" aria-hidden="true" />
        <span className="sr-only">Toggle navigation</span>
      </summary>
      <div className="bg-popover text-popover-foreground absolute top-11 left-0 w-64 rounded-lg border p-2 shadow-md">
        <NavigationLinks mobile onNavigate={closeNavigation} />
      </div>
    </details>
  )
}

function CurrentPageHeading() {
  const pathname = usePathname()
  if (pathname === "/deletions" || pathname.startsWith("/deletions/")) {
    return (
      <div className="min-w-0">
        <h1 className="truncate text-base font-semibold sm:text-lg">
          Account deletion operations
        </h1>
        <p className="text-muted-foreground hidden text-sm sm:block">
          Restricted queue detail within platform operations
        </p>
      </div>
    )
  }
  const current =
    navigation.find(
      ({ href }) => pathname === href || pathname.startsWith(`${href}/`),
    ) ?? navigation[0]

  return (
    <div className="min-w-0">
      <h1 className="truncate text-base font-semibold sm:text-lg">
        {current.label}
      </h1>
      <p className="text-muted-foreground hidden text-sm sm:block">
        {current.description}
      </p>
    </div>
  )
}

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background min-h-dvh lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="bg-sidebar hidden border-r lg:flex lg:min-h-dvh lg:flex-col">
        <div className="flex h-16 items-center border-b px-5">
          <AstreexWordmark />
          <span className="bg-background text-muted-foreground ml-2 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.16em] uppercase">
            Admin
          </span>
        </div>
        <div className="flex-1 px-3 py-5">
          <NavigationLinks />
        </div>
        <p className="text-muted-foreground border-t px-5 py-4 text-xs leading-5">
          Restricted operational console
        </p>
      </aside>

      <div className="min-w-0">
        <header className="bg-background sticky top-0 z-30 flex h-16 items-center gap-3 border-b px-4 sm:px-6 lg:px-8">
          <MobileNavigation />

          <CurrentPageHeading />
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <UserButton
              appearance={{
                elements: {
                  avatarBox: "size-8",
                },
              }}
            />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[96rem] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  )
}
