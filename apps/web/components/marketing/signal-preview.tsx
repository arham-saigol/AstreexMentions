import {
  MagnifyingGlassIcon,
  NewspaperClippingIcon,
  RedditLogoIcon,
  XLogoIcon,
} from "@phosphor-icons/react/dist/ssr"
import { Badge, CategoryBadge } from "@astreex/ui/components/badge"

const exampleMentions = [
  {
    source: "Reddit",
    context: "Product community",
    excerpt:
      "We keep losing the useful feedback after launch threads slow down. How is everyone organizing it?",
    category: "Question",
    icon: RedditLogoIcon,
  },
  {
    source: "X",
    context: "Public post",
    excerpt:
      "The new export is much faster. Being able to save the exact filter would make this part of my daily workflow.",
    category: "Feature Request",
    icon: XLogoIcon,
  },
  {
    source: "Hacker News",
    context: "Discussion thread",
    excerpt:
      "The setup is unusually clear, but the error states could explain which connection needs attention.",
    category: "Praise",
    icon: NewspaperClippingIcon,
  },
] as const

export function SignalPreview() {
  return (
    <figure
      aria-labelledby="signal-preview-title"
      className="border-border bg-card overflow-hidden rounded-xl border shadow-md"
    >
      <div className="border-border flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
        <div>
          <p
            id="signal-preview-title"
            className="text-foreground text-sm font-semibold"
          >
            Signal inbox
          </p>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Example account with sample mentions
          </p>
        </div>
        <Badge variant="muted">Illustrative view</Badge>
      </div>

      <div className="border-border bg-muted/40 border-b p-3 sm:p-4">
        <div className="border-border bg-background text-muted-foreground flex items-center gap-2 rounded-md border px-3 py-2 text-xs shadow-xs">
          <MagnifyingGlassIcon aria-hidden="true" className="size-4 shrink-0" />
          <span className="truncate">
            Watching “Astreex” OR “customer feedback workflow”
          </span>
        </div>
      </div>

      <ol
        aria-label="Example categorized mentions"
        className="divide-border divide-y"
      >
        {exampleMentions.map(
          ({ source, context, excerpt, category, icon: Icon }) => (
            <li
              key={source}
              className="grid gap-3 p-4 sm:grid-cols-[auto_1fr] sm:p-5"
            >
              <div className="border-border bg-muted text-foreground grid size-9 place-items-center rounded-md border">
                <Icon aria-hidden="true" className="size-4" weight="bold" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-foreground text-sm font-semibold">
                    {source}
                  </span>
                  <span aria-hidden="true" className="text-border">
                    /
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {context}
                  </span>
                </div>
                <p className="text-foreground mt-2 text-sm leading-6 text-pretty">
                  {excerpt}
                </p>
                <div className="mt-3">
                  <CategoryBadge category={category} />
                </div>
              </div>
            </li>
          ),
        )}
      </ol>

      <figcaption className="border-border bg-muted/35 text-muted-foreground border-t px-4 py-3 text-xs leading-5 sm:px-5">
        One review queue across configured sources. Categories are shown as an
        example of the product workflow, not live customer data.
      </figcaption>
    </figure>
  )
}
