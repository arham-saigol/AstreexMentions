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
      "We keep losing useful feedback after launch threads slow down. How is everyone organizing it?",
    category: "Question",
    icon: RedditLogoIcon,
  },
  {
    source: "X",
    context: "Public post",
    excerpt:
      "The new export is much faster. Saving this exact filter would make it part of my daily workflow.",
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
      className="border-line-strong bg-card overflow-hidden rounded-lg border"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
        <div>
          <p
            id="signal-preview-title"
            className="text-foreground text-sm font-semibold"
          >
            Mentions
          </p>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Example workspace
          </p>
        </div>
        <Badge variant="muted">Illustrative</Badge>
      </div>
      <div className="bg-secondary border-b p-3 sm:p-4">
        <div className="border-input bg-card text-muted-foreground flex items-center gap-2 rounded-md border px-3 py-2 text-xs">
          <MagnifyingGlassIcon aria-hidden="true" className="size-4 shrink-0" />
          <span className="truncate">
            Watching “Astreex” or “customer feedback workflow”
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
              className="grid grid-cols-[auto_1fr] gap-3 p-4 sm:p-5"
            >
              <Icon
                aria-hidden="true"
                className="text-muted-foreground mt-0.5 size-4"
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-foreground text-sm font-semibold">
                    {source}
                  </span>
                  <span aria-hidden="true" className="text-muted-foreground">
                    ·
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {context}
                  </span>
                </div>
                <p className="text-foreground mt-2 text-sm leading-6">
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
      <figcaption className="bg-secondary text-muted-foreground border-t px-4 py-3 text-xs leading-5 sm:px-5">
        Illustrative mentions. Original context stays attached.
      </figcaption>
    </figure>
  )
}
