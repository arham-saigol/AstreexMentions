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
      "Published product updates are temporarily unavailable. Astreex will not fill the gap with sample or unverified releases.",
    note: "Private drafts remain private.",
    icon: WrenchIcon,
  },
  empty: {
    eyebrow: "Nothing published yet",
    title: "The changelog is ready for its first entry.",
    description:
      "There are no published product updates yet. The first one will appear here when it is ready.",
    note: "Draft entries remain private.",
    icon: NoteBlankIcon,
  },
  error: {
    eyebrow: "Request unavailable",
    title: "Published updates could not be loaded.",
    description:
      "Astreex could not load published updates right now. No sample or unverified releases are shown in their place.",
    note: "Private drafts remain private.",
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
        <p className="editorial-eyebrow mt-5">{content.eyebrow}</p>
        <h2
          id="changelog-state-title"
          className="font-display text-foreground mt-3 text-3xl font-medium tracking-[-0.02em]"
        >
          {content.title}
        </h2>
        <p className="mt-3 text-sm leading-6 text-[var(--ink-secondary)] sm:text-base">
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
