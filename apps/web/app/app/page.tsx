import { CircleNotchIcon } from "@phosphor-icons/react/dist/ssr"

export default function DashboardEntryPage() {
  return (
    <section className="grid min-h-[50vh] place-items-center" role="status">
      <div className="text-center">
        <CircleNotchIcon
          aria-hidden="true"
          className="text-primary mx-auto size-6 animate-spin"
          weight="bold"
        />
        <h1 className="text-foreground mt-4 text-lg font-semibold">
          Opening your dashboard
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Checking onboarding and subscription access.
        </p>
      </div>
    </section>
  )
}
