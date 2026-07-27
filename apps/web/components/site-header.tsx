import { Show, UserButton } from "@clerk/nextjs"
import { AstreexWordmark } from "@astreex/ui/components/astreex-wordmark"
import { Button } from "@astreex/ui/components/button"
import { ThemeToggle } from "@astreex/ui/components/theme-toggle"
import Link from "next/link"

import { MobileNavigation } from "@/components/mobile-navigation"
import { getRuntimeConfiguration } from "@/lib/env"
import { publicNavigationLinks } from "@/lib/site-navigation"

function SignedOutNavigation() {
  return (
    <>
      <Button
        asChild
        size="sm"
        variant="ghost"
        className="hidden sm:inline-flex"
      >
        <Link href="/sign-in">Sign in</Link>
      </Button>
      <Button asChild size="sm" className="hidden sm:inline-flex">
        <Link href="/sign-up">Get started</Link>
      </Button>
    </>
  )
}

function ClerkNavigation() {
  return (
    <>
      <Show when="signed-out">
        <SignedOutNavigation />
      </Show>
      <Show when="signed-in">
        <div className="flex items-center gap-2">
          <Button
            asChild
            size="sm"
            variant="outline"
            className="hidden sm:inline-flex"
          >
            <Link href="/app">Dashboard</Link>
          </Button>
          <UserButton />
        </div>
      </Show>
    </>
  )
}

export function SiteHeader() {
  const configuration = getRuntimeConfiguration()

  return (
    <header className="border-border bg-background sticky top-0 z-40 border-b">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" aria-label="Astreex home" className="shrink-0">
          <AstreexWordmark
            className="text-base sm:text-lg"
            markClassName="size-6 sm:size-7"
          />
        </Link>

        <nav
          aria-label="Primary navigation"
          className="ml-auto hidden items-center gap-5 lg:flex"
        >
          {publicNavigationLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-muted-foreground hover:text-foreground text-sm font-medium transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1 lg:ml-3">
          <ThemeToggle />
          <MobileNavigation clerkEnabled={configuration.clerk.configured} />
          {configuration.clerk.configured ? (
            <ClerkNavigation />
          ) : (
            <SignedOutNavigation />
          )}
        </div>
      </div>
    </header>
  )
}
