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
                "relative inline-flex h-10 items-center gap-2 rounded-md px-2 text-[13px] font-medium transition-colors duration-[var(--motion-control)] max-[380px]:gap-0 sm:px-3 md:w-full md:px-3 max-[380px]:[&>svg]:hidden",
                active
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              <NavigationIcon
                aria-hidden="true"
                className="size-4"
                strokeWidth={active ? 2.4 : 2}
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
          className="text-muted-foreground hover:bg-secondary hover:text-foreground flex h-10 w-full items-center gap-2 rounded-md px-3 text-left text-[13px] font-medium transition-colors"
          onClick={(event) => openSettings(section, event.currentTarget)}
        >
          <Icon aria-hidden="true" className="size-4" />
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
          className="h-10 gap-1.5 rounded-md px-1.5 sm:gap-2 sm:pr-2"
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
            className="text-muted-foreground size-3.5 max-[380px]:hidden"
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
    <div className="border-border bg-secondary border-b" role="status">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <p className="text-foreground text-sm font-medium">
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

export function ProductShell({ children }: { children: ReactNode }) {
  return (
    <ProductDialogsProvider>
      <div className="bg-background min-h-dvh md:grid md:grid-cols-[232px_minmax(0,1fr)]">
        <a
          href="#product-main-content"
          className="bg-background text-foreground focus-visible:ring-ring fixed top-3 left-3 z-50 -translate-y-20 rounded-md border px-3 py-2 text-sm font-medium shadow-sm transition-transform focus-visible:translate-y-0 focus-visible:ring-2 focus-visible:outline-none"
        >
          Skip to main content
        </a>
        <aside className="border-sidebar-border bg-sidebar sticky top-0 hidden h-dvh flex-col border-r px-4 py-5 md:flex">
          <Link
            href="/app"
            aria-label="Astreex dashboard home"
            className="px-2"
          >
            <AstreexWordmark className="text-base" markClassName="size-6" />
          </Link>
          <div className="mt-10">
            <p className="text-muted-foreground mb-2 px-3 text-xs font-semibold tracking-[0.06em] uppercase">
              Listen
            </p>
            <ProductNavigation />
          </div>
          <div className="mt-6">
            <p className="text-muted-foreground mb-2 px-3 text-xs font-semibold tracking-[0.06em] uppercase">
              Configure
            </p>
            <ConfigurationNavigation />
          </div>
          <div className="mt-auto flex items-center justify-between border-t pt-4">
            <span className="text-muted-foreground pl-2 text-xs">
              Workspace
            </span>
            <ProductAvatarMenu />
          </div>
        </aside>

        <div className="min-w-0">
          <header className="border-border bg-background sticky top-0 z-40 border-b md:hidden">
            <div className="flex h-14 items-center gap-2 px-3 sm:px-4">
              <Link
                href="/app"
                aria-label="Astreex dashboard home"
                className="shrink-0"
              >
                <AstreexWordmark className="text-sm" markClassName="size-5" />
              </Link>
              <div className="ml-auto min-w-0">
                <ProductNavigation />
              </div>
              <div>
                <ProductAvatarMenu />
              </div>
            </div>
          </header>
          <AccessNotice />
          <main
            id="product-main-content"
            tabIndex={-1}
            className="bg-card mx-auto min-h-dvh w-full max-w-[1280px] px-4 py-8 sm:px-8 sm:py-10 lg:px-12"
          >
            {children}
          </main>
        </div>
      </div>
    </ProductDialogsProvider>
  )
}
