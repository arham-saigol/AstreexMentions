import { CircleNotchIcon } from "@phosphor-icons/react/dist/ssr"

export default function Loading() {
  return (
    <main className="mx-auto grid min-h-[70dvh] w-full max-w-2xl place-items-center px-6 py-16">
      <div
        role="status"
        aria-live="polite"
        className="border-border bg-muted/50 text-foreground flex w-full items-start gap-3 rounded-lg border p-4 text-sm"
      >
        <CircleNotchIcon
          aria-hidden="true"
          weight="bold"
          className="mt-0.5 size-5 shrink-0 animate-spin"
        />
        <div>
          <p className="font-medium">Loading Astreex</p>
          <p className="mt-1 text-current/80">
            Preparing the requested page. No account, subscription, or
            monitoring data is being inferred while you wait.
          </p>
        </div>
      </div>
    </main>
  )
}
