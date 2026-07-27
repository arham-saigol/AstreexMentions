import {
  BookmarksSimpleIcon,
  EnvelopeOpenIcon,
  SparkleIcon,
} from "@phosphor-icons/react/dist/ssr"
import { Badge, CategoryBadge } from "@astreex/ui/components/badge"
import type { ReactNode } from "react"

const capabilities = [
  {
    eyebrow: "AI categorization",
    title: "Read by intent, not by arrival time.",
    description:
      "Astreex applies clear category labels so questions, bugs, praise, complaints, feature requests, and competitor mentions can be reviewed in context. The labels organize the queue; you stay in control of what matters.",
    icon: SparkleIcon,
    preview: (
      <div className="space-y-2.5" aria-label="Example mention categories">
        <div className="border-border bg-background grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border px-3 py-2.5">
          <span className="text-foreground min-w-0 truncate text-xs font-medium">
            “Does this work with our existing export?”
          </span>
          <CategoryBadge category="Question" />
        </div>
        <div className="border-border bg-background grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border px-3 py-2.5">
          <span className="text-foreground min-w-0 truncate text-xs font-medium">
            “Please add a reusable launch filter.”
          </span>
          <CategoryBadge category="Feature Request" />
        </div>
        <div className="border-border bg-background grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border px-3 py-2.5">
          <span className="text-foreground min-w-0 truncate text-xs font-medium">
            “The settings page no longer opens.”
          </span>
          <CategoryBadge category="Bug" />
        </div>
      </div>
    ),
  },
  {
    eyebrow: "Saved views",
    title: "Keep recurring questions one click away.",
    description:
      "Combine sources, keywords, and categories into repeatable views for launches, competitor research, product areas, or customer pain points. Return to the same scope without rebuilding a search every time.",
    icon: BookmarksSimpleIcon,
    preview: (
      <div
        className="border-border divide-border bg-background overflow-hidden rounded-md border"
        aria-label="Example saved views"
      >
        {[
          ["Launch feedback", "All sources · Questions + Bugs"],
          ["Competitor shifts", "X + Hacker News · Competitor mentions"],
          ["Feature demand", "Reddit · Feature requests"],
        ].map(([name, detail], index) => (
          <div
            key={name}
            className="flex items-center gap-3 border-b px-3 py-3 last:border-b-0"
          >
            <span className="text-muted-foreground grid size-6 shrink-0 place-items-center rounded border text-[10px] font-semibold tabular-nums">
              {index + 1}
            </span>
            <div className="min-w-0">
              <p className="text-foreground truncate text-xs font-semibold">
                {name}
              </p>
              <p className="text-muted-foreground mt-0.5 truncate text-[11px]">
                {detail}
              </p>
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    eyebrow: "Daily digests",
    title: "Review the signal without reopening the feed.",
    description:
      "Turn the latest categorized mentions into a concise email digest, with source context and links back to the underlying conversations when you need to go deeper.",
    icon: EnvelopeOpenIcon,
    preview: (
      <div
        className="border-border bg-background overflow-hidden rounded-md border"
        aria-label="Example digest outline"
      >
        <div className="border-border flex items-center justify-between gap-3 border-b px-3 py-2.5">
          <span className="text-foreground min-w-0 truncate text-xs font-semibold">
            Daily signal digest
          </span>
          <Badge variant="muted">Example</Badge>
        </div>
        <ul className="text-muted-foreground space-y-2 px-4 py-3 text-xs leading-5">
          <li>
            <span className="text-foreground font-medium">Questions:</span>{" "}
            integration and export workflow
          </li>
          <li>
            <span className="text-foreground font-medium">Requests:</span>{" "}
            reusable launch filters
          </li>
          <li>
            <span className="text-foreground font-medium">Watch:</span> setup
            friction in one source connection
          </li>
        </ul>
      </div>
    ),
  },
] as const satisfies ReadonlyArray<{
  eyebrow: string
  title: string
  description: string
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>
  preview: ReactNode
}>

export function CapabilityShowcase() {
  return (
    <div className="border-border mt-12 min-w-0 border-y">
      {capabilities.map(
        ({ eyebrow, title, description, icon: Icon, preview }, index) => (
          <article
            key={title}
            className="border-border grid min-w-0 gap-8 border-b py-9 last:border-b-0 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.72fr)] lg:items-center lg:gap-16 lg:py-12"
          >
            <div className="flex min-w-0 gap-4 sm:gap-5">
              <div className="border-border bg-muted text-primary mt-0.5 grid size-10 shrink-0 place-items-center rounded-lg border">
                <Icon aria-hidden="true" className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="text-primary text-xs font-semibold tracking-wide uppercase">
                  {eyebrow}
                </p>
                <h3 className="text-foreground mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
                  {title}
                </h3>
                <p className="text-muted-foreground mt-3 max-w-2xl text-sm leading-6 sm:text-base sm:leading-7">
                  {description}
                </p>
              </div>
            </div>
            <div className="border-border bg-muted/40 min-w-0 rounded-lg border p-3 sm:p-4">
              <p className="text-muted-foreground mb-3 text-[11px] font-medium tracking-wide uppercase">
                Example output {index + 1} of {capabilities.length}
              </p>
              {preview}
            </div>
          </article>
        ),
      )}
    </div>
  )
}
