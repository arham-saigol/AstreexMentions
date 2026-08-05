import { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/ssr"
import { Button } from "@astreex/ui/components/button"
import {
  EmptyState,
  EmptyStateActions,
  EmptyStateDescription,
  EmptyStateIcon,
  EmptyStateTitle,
} from "@astreex/ui/components/empty-state"
import Link from "next/link"

export default function NotFound() {
  return (
    <main className="mx-auto grid min-h-[70dvh] w-full max-w-3xl place-items-center px-6 py-16">
      <EmptyState aria-labelledby="not-found-title" className="min-h-80">
        <EmptyStateIcon>
          <MagnifyingGlassIcon aria-hidden="true" />
        </EmptyStateIcon>
        <p className="editorial-eyebrow mb-2">404 · No matching page</p>
        <EmptyStateTitle id="not-found-title">
          Nothing is published here.
        </EmptyStateTitle>
        <EmptyStateDescription>
          This address does not point to an Astreex page. Check the URL, return
          to the homepage, or sign in to continue to your account.
        </EmptyStateDescription>
        <EmptyStateActions>
          <Button asChild>
            <Link href="/">Return home</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/sign-in">Sign in</Link>
          </Button>
        </EmptyStateActions>
      </EmptyState>
    </main>
  )
}
