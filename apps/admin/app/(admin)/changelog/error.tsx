"use client"

import { Button } from "@astreex/ui/components/button"
import { StatusState } from "@astreex/ui/components/status-state"
import { ArrowClockwiseIcon } from "@phosphor-icons/react/dist/ssr"

export default function ChangelogError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  void error

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-2xl items-center py-12">
      <StatusState
        className="bg-card w-full"
        variant="error"
        title="Changelog management could not be rendered"
        description="An unexpected error interrupted this view. No placeholder entries or local fallback data are shown."
        action={
          <Button type="button" variant="outline" onClick={reset}>
            <ArrowClockwiseIcon aria-hidden="true" />
            Try again
          </Button>
        }
      />
    </div>
  )
}
