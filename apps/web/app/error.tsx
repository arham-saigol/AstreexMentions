"use client"

import { ArrowClockwiseIcon } from "@phosphor-icons/react"
import { Button } from "@astreex/ui/components/button"
import { StatusState } from "@astreex/ui/components/status-state"
import Link from "next/link"
import { useEffect } from "react"

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="mx-auto grid min-h-[70dvh] w-full max-w-2xl place-items-center px-6 py-16">
      <div className="w-full">
        <p className="editorial-eyebrow">Astreex</p>
        <h1 className="font-display text-foreground mt-3 text-4xl font-medium tracking-[-0.03em]">
          This page could not be loaded.
        </h1>
        <p className="text-muted-foreground mt-3 text-sm leading-6 sm:text-base">
          The request did not complete, so no account, subscription, or
          monitoring data has been assumed or filled in. Try the request again,
          or return to the public site.
        </p>
        <StatusState
          variant="error"
          title="Content unavailable"
          description="Your existing configuration and data have not been changed."
          className="mt-7"
        />
        <div className="mt-7 flex flex-wrap gap-3">
          <Button onClick={reset}>
            <ArrowClockwiseIcon aria-hidden="true" />
            Try again
          </Button>
          <Button asChild variant="outline">
            <Link href="/">Return home</Link>
          </Button>
        </div>
      </div>
    </main>
  )
}
