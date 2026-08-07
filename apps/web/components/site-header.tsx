import { Show, UserButton } from "@clerk/nextjs"
import { AstreexWordmark } from "@astreex/ui/components/astreex-wordmark"
import { Button } from "@astreex/ui/components/button"
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
        <Link href="/sign-up">Start monitoring</Link>
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
    <header className="border-border bg-background/90 supports-[backdrop-filter]:bg-background/75 sticky top-0 z-40 border-b backdrop-blur-xl">
      <div className="relative mx-auto flex h-16 w-full max-w-[1184px] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Link href="/" aria-label="Astreex home" className="shrink-0">
          <AstreexWordmark markClassName="size-6.5" />
        </Link>

        <nav
          aria-label="Primary navigation"
          className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-7 lg:flex"
        >
          {publicNavigationLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-muted-foreground hover:text-foreground text-sm font-medium transition-colors duration-[var(--motion-control)]"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1">
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
