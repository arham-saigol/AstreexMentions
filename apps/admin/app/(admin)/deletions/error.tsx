"use client"

import { Button } from "@astreex/ui/components/button"

export default function DeletionsError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <section className="admin-panel p-6" role="alert">
      <h2 className="text-lg font-semibold">Deletion operations unavailable</h2>
      <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
        The queue could not be rendered safely. No operator mutation was
        attempted.
      </p>
      <Button className="mt-4" onClick={reset} type="button" variant="outline">
        Retry
      </Button>
    </section>
  )
}
