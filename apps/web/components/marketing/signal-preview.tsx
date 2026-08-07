import {
  NewspaperClippingIcon,
  RedditLogoIcon,
  XLogoIcon,
} from "@phosphor-icons/react/dist/ssr"
import { Badge } from "@astreex/ui/components/badge"

const exampleMentions = [
  {
    source: "r/SaaS",
    author: "u/indie_builds",
    excerpt:
      "Anyone using Astreex for customer monitoring? I want Reddit comments and a digest that respects my timezone.",
    category: "Question",
    variant: "question",
    time: "2h",
    icon: RedditLogoIcon,
    glyph: "bg-[var(--category-other)] text-foreground",
  },
  {
    source: "X",
    author: "@devops_dan",
    excerpt:
      "The new export is much faster. Saving this exact filter would make it part of my daily workflow.",
    category: "Feature Request",
    variant: "feature",
    time: "5h",
    icon: XLogoIcon,
    glyph: "bg-foreground text-white",
  },
  {
    source: "Hacker News",
    author: "patio_fan",
    excerpt:
      "Caught a useful complaint quickly enough to answer before the thread moved on. That alone is worth it.",
    category: "Praise",
    variant: "praise",
    time: "1d",
    icon: NewspaperClippingIcon,
    glyph: "bg-bug text-bug-foreground",
  },
] as const

export function SignalPreview() {
  return (
    <figure aria-labelledby="signal-preview-title">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p
            id="signal-preview-title"
            className="font-display text-2xl font-medium tracking-[-0.02em]"
          >
            Mentions
          </p>
          <p className="text-muted-foreground mt-0.5 font-mono text-[11px]">
            Illustrative workspace · 87 today
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="question">Question</Badge>
          <Badge variant="bug">Bug</Badge>
          <Badge variant="praise">Praise</Badge>
        </div>
      </div>

      <ol aria-label="Example categorized mentions" className="space-y-2.5">
        {exampleMentions.map(
          ({
            source,
            author,
            excerpt,
            category,
            variant,
            time,
            icon: Icon,
            glyph,
          }) => (
            <li
              key={`${source}-${category}`}
              className="surface-hover bg-card rounded-lg border p-4"
            >
              <div className="flex flex-wrap items-center gap-2.5">
                <span
                  className={`grid size-[18px] place-items-center rounded-sm ${glyph}`}
                >
                  <Icon aria-hidden="true" className="size-3" weight="bold" />
                </span>
                <span className="text-[13px] font-medium">{source}</span>
                <span className="text-muted-foreground font-mono text-[11px]">
                  {author}
                </span>
                <Badge variant={variant}>{category}</Badge>
                <time className="ml-auto font-mono text-[11px] text-[var(--ink-faint)]">
                  {time}
                </time>
              </div>
              <p className="mt-3 text-[13.5px] leading-[1.62]">{excerpt}</p>
            </li>
          ),
        )}
      </ol>
      <figcaption className="sr-only">
        Illustrative mentions. Original context stays attached.
      </figcaption>
    </figure>
  )
}
