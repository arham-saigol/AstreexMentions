import {
  NoteBlankIcon,
  WarningCircleIcon,
  WrenchIcon,
} from "@phosphor-icons/react/dist/ssr"
import { Button } from "@astreex/ui/components/button"
import Link from "next/link"

type ChangelogStateProps = {
  state: "configuration-required" | "empty" | "error"
}

const stateContent = {
  "configuration-required": {
    eyebrow: "Data service unavailable",
    title: "The public changelog is not configured.",
    description:
      "Published entries require a valid Convex deployment. No releases, dates, or product changes are being filled in while that service is unavailable.",
    note: "No draft or private changelog data has been requested.",
    icon: WrenchIcon,
  },
  empty: {
    eyebrow: "Nothing published yet",
    title: "The changelog is ready for its first entry.",
    description:
      "The public published-entry query completed successfully, but it did not return any published updates.",
    note: "Draft entries remain private and are not included here.",
    icon: NoteBlankIcon,
  },
  error: {
    eyebrow: "Request unavailable",
    title: "Published updates could not be loaded.",
    description:
      "The configured public changelog query did not return a usable response. Astreex is not substituting sample releases or displaying unverified data.",
    note: "Draft and administrative records have not been requested.",
    icon: WarningCircleIcon,
  },
} as const

export function ChangelogState({ state }: ChangelogStateProps) {
  const content = stateContent[state]
  const Icon = content.icon

  return (
    <section
      aria-labelledby="changelog-state-title"
      className="border-border border-y py-10 sm:py-12"
    >
      <div className="max-w-2xl">
        <div className="border-border bg-muted text-muted-foreground grid size-10 place-items-center rounded-lg border">
          <Icon aria-hidden="true" className="size-5" />
        </div>
        <p className="text-primary mt-5 text-xs font-semibold tracking-wide uppercase">
          {content.eyebrow}
        </p>
        <h2
          id="changelog-state-title"
          className="text-foreground mt-2 text-2xl font-semibold tracking-tight"
        >
          {content.title}
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-6 sm:text-base">
          {content.description}
        </p>
        <p className="text-muted-foreground mt-4 text-xs leading-5">
          {content.note}
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link href="/">Return home</Link>
        </Button>
      </div>
    </section>
  )
}
