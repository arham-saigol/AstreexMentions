"use client"

import { Button, StatusState } from "@astreex/ui"
import { ArrowClockwiseIcon } from "@phosphor-icons/react/dist/ssr"

export default function MetricsError({
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
        title="Metrics could not be rendered"
        description="The dashboard encountered an unexpected error. No placeholder metrics are shown."
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
