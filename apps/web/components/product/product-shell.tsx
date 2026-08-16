"use client"

import { SignOutButton, useUser } from "@clerk/nextjs"
import { AstreexWordmark } from "@astreex/ui/components/astreex-wordmark"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@astreex/ui/components/avatar"
import { Button } from "@astreex/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@astreex/ui/components/dropdown-menu"
import { cn } from "@astreex/ui/lib/utils"
import {
  AtSign,
  ChevronDown,
  CreditCard,
  KeyRound,
  LayoutGrid,
  Lightbulb,
  LogOut,
  Mail,
  Settings,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useRef, type ReactNode } from "react"

import {
  ProductDialogsProvider,
  useProductDialogs,
} from "@/components/product/product-dialogs"
import { useProductContext } from "@/components/product/product-context"
import type { SettingsSectionId } from "@/components/product/settings-dialog-shell"
import { ThemeToggle } from "@/components/theme-toggle"

const productNavigation = [
  { href: "/app/mentions", label: "Mentions", icon: AtSign },
  { href: "/app/keywords", label: "Keywords", icon: KeyRound },
] as const

function initials(
  name: string | null | undefined,
  email: string | null | undefined,
) {
  const source = name?.trim() || email?.trim() || "Astreex user"
  const words = source.split(/\s+/).filter(Boolean)
  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("")
}

function ProductNavigation() {
  const pathname = usePathname()

  return (
    <nav aria-label="Product navigation" className="min-w-0">
      <div className="flex items-center gap-1 md:flex-col md:items-stretch md:gap-1">
        {productNavigation.map(({ href, icon: NavigationIcon, label }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`)

          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative inline-flex h-9 items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 text-[13px] font-medium transition-[background-color,color,transform] duration-[var(--motion-feedback)] max-[380px]:gap-0 sm:px-3 md:w-full md:before:absolute md:before:left-0 md:before:top-1/2 md:before:h-[18px] md:before:w-[2px] md:before:-translate-y-1/2 md:before:rounded-full md:before:bg-[var(--accent)] md:before:content-[''] md:before:transition-[opacity] md:before:duration-[var(--motion-control)] max-[380px]:[&>svg]:hidden",
                active
                  ? "bg-[var(--surface-active)] text-foreground md:before:opacity-100"
                  : "text-muted-foreground hover:bg-[var(--surface-hover)] hover:text-foreground md:before:opacity-0",
              )}
            >
              <NavigationIcon
                aria-hidden="true"
                className="size-4 shrink-0"
                strokeWidth={active ? 2.2 : 1.8}
              />
              {label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

const configurationNavigation = [
  { label: "Categories", section: "categories", icon: LayoutGrid },
  { label: "Digest", section: "digest", icon: Mail },
  { label: "Billing", section: "billing", icon: CreditCard },
] as const satisfies ReadonlyArray<{
  label: string
  section: SettingsSectionId
  icon: typeof LayoutGrid
}>

function ConfigurationNavigation() {
  const { openSettings } = useProductDialogs()

  return (
    <nav aria-label="Product configuration" className="space-y-1">
      {configurationNavigation.map(({ icon: Icon, label, section }) => (
        <button
          key={section}
          type="button"
          className="text-muted-foreground hover:bg-[var(--surface-hover)] hover:text-foreground flex h-9 w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 text-left text-[13px] font-medium transition-[background-color,color] duration-[var(--motion-feedback)] sm:px-3"
          onClick={(event) => openSettings(section, event.currentTarget)}
        >
          <Icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.8} />
          {label}
        </button>
      ))}
    </nav>
  )
}

function ProductAvatarMenu() {
  const { user } = useUser()
  const { openFeatureRequests, openSettings } = useProductDialogs()
  const accountMenuTriggerRef = useRef<HTMLButtonElement>(null)
  const primaryEmail = user?.primaryEmailAddress?.emailAddress
  const displayName = user?.fullName || user?.username || "Astreex user"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          ref={accountMenuTriggerRef}
          variant="ghost"
          className="size-9 gap-1 rounded-full p-0 sm:gap-1.5 sm:pr-1.5 sm:pl-0.5"
          aria-label="Open account menu"
        >
          <Avatar className="size-7">
            {user?.imageUrl && (
              <AvatarImage
                src={user.imageUrl}
                alt=""
                referrerPolicy="no-referrer"
              />
            )}
            <AvatarFallback>
              {initials(displayName, primaryEmail)}
            </AvatarFallback>
          </Avatar>
          <ChevronDown
            aria-hidden="true"
            className="text-muted-foreground hidden size-3.5 sm:block"
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <span className="text-foreground block truncate text-sm font-medium">
            {displayName}
          </span>
          {primaryEmail && (
            <span className="text-muted-foreground mt-0.5 block truncate text-xs">
              {primaryEmail}
            </span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() =>
            openSettings("general", accountMenuTriggerRef.current)
          }
        >
          <Settings aria-hidden="true" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => openFeatureRequests(accountMenuTriggerRef.current)}
        >
          <Lightbulb aria-hidden="true" />
          Feature Requests
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <SignOutButton redirectUrl="/">
          <DropdownMenuItem variant="destructive">
            <LogOut aria-hidden="true" />
            Sign Out
          </DropdownMenuItem>
        </SignOutButton>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function AccessNotice() {
  const { access } = useProductContext()

  if (access.mode !== "preview") {
    return null
  }

  return (
    <div className="border-b border-[var(--line)] bg-[var(--surface-inset)]" role="status">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-10">
        <p className="text-foreground text-[13px] font-medium">
          Preview mode — monitoring is not active.
        </p>
        <p className="text-muted-foreground text-xs leading-5 sm:text-right">
          {access.billingSetupRequired
            ? "Billing must be configured before a subscription can be started."
            : "Choose a plan to start collecting customer mentions."}
        </p>
      </div>
    </div>
  )
}

function Breadcrumb() {
  const pathname = usePathname()
  const active = productNavigation.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  )
  const label = active?.label ?? "Dashboard"

  return (
    <div className="text-muted-foreground flex min-w-0 items-center gap-2 text-[13px]">
      <span className="hidden sm:inline">Astreex</span>
      <span aria-hidden="true" className="hidden text-[var(--text-tertiary)] sm:inline">
        /
      </span>
      <strong className="text-foreground font-medium">{label}</strong>
    </div>
  )
}

export function ProductShell({
  children,
  variant = "sidebar",
}: {
  children: ReactNode
  variant?: "sidebar" | "fullscreen"
}) {
  const { workspace } = useProductContext()

  if (variant === "fullscreen") {
    return (
      <ProductDialogsProvider>
        <div className="bg-background text-foreground flex min-h-dvh flex-col">
          <a
            href="#product-main-content"
            className="bg-background text-foreground focus-visible:ring-ring fixed top-3 left-3 z-50 -translate-y-20 rounded-[var(--radius-sm)] border px-3 py-2 text-sm font-medium shadow-[var(--shadow-sm)] transition-transform focus-visible:translate-y-0 focus-visible:ring-2 focus-visible:outline-none"
          >
            Skip to main content
          </a>

          <main id="product-main-content" tabIndex={-1} className="flex flex-1 flex-col justify-center">
            {children}
          </main>
        </div>
      </ProductDialogsProvider>
    )
  }

  return (
    <ProductDialogsProvider>
      <div className="bg-background text-foreground min-h-dvh">
        <a
          href="#product-main-content"
          className="bg-background text-foreground focus-visible:ring-ring fixed top-3 left-3 z-50 -translate-y-20 rounded-[var(--radius-sm)] border px-3 py-2 text-sm font-medium shadow-[var(--shadow-sm)] transition-transform focus-visible:translate-y-0 focus-visible:ring-2 focus-visible:outline-none"
        >
          Skip to main content
        </a>

        <div className="md:grid md:grid-cols-[var(--sidebar-w)_minmax(0,1fr)]">
          <aside className="border-sidebar-border bg-sidebar sticky top-0 hidden h-dvh flex-col border-r md:flex">
            <div className="border-sidebar-border flex h-[var(--topbar-h)] items-center border-b px-4">
              <Link
                href="/app"
                aria-label="Astreex dashboard home"
                className="inline-flex items-center"
              >
                <AstreexWordmark className="text-[17px]" markClassName="size-6" />
              </Link>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-2.5 py-4">
              <div>
                <p className="text-muted-foreground mb-1.5 px-2.5 text-[10px] font-bold tracking-[0.09em] uppercase">
                  Listen
                </p>
                <ProductNavigation />
              </div>
              <div>
                <p className="text-muted-foreground mb-1.5 px-2.5 text-[10px] font-bold tracking-[0.09em] uppercase">
                  Configure
                </p>
                <ConfigurationNavigation />
              </div>
            </div>

            <div className="border-sidebar-border flex items-center gap-2 overflow-hidden border-t px-3 py-3">
              <span className="text-muted-foreground min-w-0 flex-1 truncate pl-1 text-xs">
                {workspace.workspace.name}
              </span>
              <ProductAvatarMenu />
            </div>
          </aside>

          <div className="min-w-0">
            <header className="border-b border-[var(--line)] bg-background/85 supports-[backdrop-filter]:bg-background/70 hidden h-[var(--topbar-h)] items-center gap-3 px-6 backdrop-blur-xl md:flex">
              <Breadcrumb />
              <div className="ml-auto flex items-center gap-2">
                <ThemeToggle />
              </div>
            </header>

            <header className="border-b border-[var(--line)] bg-sidebar sticky top-0 z-40 flex h-14 items-center gap-2 px-3 md:hidden">
              <Link
                href="/app"
                aria-label="Astreex dashboard home"
                className="shrink-0"
              >
                <AstreexWordmark className="text-sm" markClassName="size-5" />
              </Link>
              <div className="ml-auto flex min-w-0 items-center gap-1">
                <ProductNavigation />
              </div>
              <ThemeToggle />
              <ProductAvatarMenu />
            </header>

            <AccessNotice />
            <main id="product-main-content" tabIndex={-1} className="min-h-dvh">
              <div className="mx-auto w-full max-w-[1200px] px-4 py-7 sm:px-6 sm:py-9 lg:px-10">
                {children}
              </div>
            </main>
          </div>
        </div>
      </div>
    </ProductDialogsProvider>
  )
}