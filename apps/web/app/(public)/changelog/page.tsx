import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CalendarBlankIcon,
  MegaphoneSimpleIcon,
} from "@phosphor-icons/react/dist/ssr"
import { Badge } from "@astreex/ui/components/badge"
import type { Metadata } from "next"
import Link from "next/link"

import { ChangelogState } from "@/components/changelog-state"
import {
  changelogDateTime,
  formatChangelogDate,
  getPublishedChangelogEntries,
} from "@/lib/changelog"

export const dynamic = "force-dynamic"

type ChangelogPageProps = {
  searchParams: Promise<{ cursor?: string | string[] }>
}

const changelogMetadata: Metadata = {
  title: "Product changelog",
  description:
    "Published Astreex product updates, improvements, and operational changes.",
  alternates: {
    canonical: "/changelog",
  },
  openGraph: {
    type: "website",
    url: "/changelog",
    title: "Product changelog · Astreex",
    description:
      "Published Astreex product updates, improvements, and operational changes.",
  },
  twitter: {
    card: "summary",
    title: "Product changelog · Astreex",
    description:
      "Published Astreex product updates, improvements, and operational changes.",
  },
}

export async function generateMetadata(): Promise<Metadata> {
  const result = await getPublishedChangelogEntries()

  return result.state === "ready"
    ? changelogMetadata
    : {
        ...changelogMetadata,
        robots: { index: false, follow: true },
      }
}

export default async function ChangelogPage({
  searchParams,
}: ChangelogPageProps) {
  const rawCursor = (await searchParams).cursor
  const cursor = typeof rawCursor === "string" ? rawCursor : undefined
  const result = await getPublishedChangelogEntries(cursor)

  return (
    <>
      <header className="border-border border-b">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-16 sm:py-20 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-end">
          <div className="max-w-3xl">
            <Badge variant="outline" className="gap-1.5">
              <MegaphoneSimpleIcon aria-hidden="true" />
              Product changelog
            </Badge>
            <h1 className="font-display text-foreground mt-5 text-5xl font-medium tracking-[-0.03em] text-balance sm:text-6xl">
              Astreex changes, published with context.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-pretty text-[var(--ink-secondary)]">
              A chronological record of shipped improvements and product
              changes, drawn only from entries that have been deliberately
              published.
            </p>
          </div>

          <div className="border-border lg:border-l lg:pl-6">
            <p className="text-foreground text-sm font-semibold">
              Public entries only
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--ink-secondary)]">
              Only deliberately published updates appear here. Drafts and
              archived entries remain private.
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
        {result.state === "configuration-required" && (
          <ChangelogState state="configuration-required" />
        )}

        {result.state === "error" && <ChangelogState state="error" />}

        {result.state === "ready" && result.entries.length === 0 && (
          <ChangelogState state="empty" />
        )}

        {result.state === "ready" && result.entries.length > 0 && (
          <section aria-labelledby="published-updates-title">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-primary text-sm font-semibold">
                  Published updates
                </p>
                <h2
                  id="published-updates-title"
                  className="font-display text-foreground mt-2 text-3xl font-medium tracking-[-0.02em] sm:text-4xl"
                >
                  What has changed.
                </h2>
              </div>
              <p className="text-muted-foreground text-sm">
                {result.entries.length} published{" "}
                {result.entries.length === 1 ? "entry" : "entries"} on this page
              </p>
            </div>

            <ol className="border-border mt-10 divide-y border-y">
              {result.entries.map((entry) => (
                <li key={entry.slug}>
                  <article>
                    <Link
                      href={`/changelog/${entry.slug}`}
                      className="group grid gap-5 py-7 sm:py-8 md:grid-cols-[12rem_minmax(0,1fr)_auto] md:items-start md:gap-8"
                    >
                      <time
                        dateTime={changelogDateTime(entry.publishedAt)}
                        className="text-muted-foreground flex items-center gap-2 text-sm"
                      >
                        <CalendarBlankIcon
                          aria-hidden="true"
                          className="size-4"
                        />
                        {formatChangelogDate(entry.publishedAt)}
                      </time>

                      <div>
                        <h3 className="font-display text-foreground text-xl font-medium tracking-[-0.02em] text-balance transition-colors group-hover:text-[var(--ink-secondary)] sm:text-2xl">
                          {entry.title}
                        </h3>
                        <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--ink-secondary)] sm:text-base sm:leading-7">
                          {entry.summary}
                        </p>
                      </div>

                      <span className="border-border text-muted-foreground group-hover:border-primary/40 group-hover:text-primary grid size-9 place-items-center rounded-md border transition-colors md:mt-1">
                        <ArrowRightIcon aria-hidden="true" className="size-4" />
                        <span className="sr-only">Read {entry.title}</span>
                      </span>
                    </Link>
                  </article>
                </li>
              ))}
            </ol>

            {(cursor || result.nextCursor) && (
              <nav
                aria-label="Changelog pagination"
                className="mt-8 flex items-center justify-between gap-4"
              >
                {cursor ? (
                  <Link
                    href="/changelog"
                    className="border-border text-foreground hover:border-primary/40 inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-semibold transition-colors"
                  >
                    <ArrowLeftIcon aria-hidden="true" className="size-4" />
                    Newest updates
                  </Link>
                ) : (
                  <span />
                )}
                {result.nextCursor && (
                  <Link
                    href={{
                      pathname: "/changelog",
                      query: { cursor: result.nextCursor },
                    }}
                    className="border-border text-foreground hover:border-primary/40 inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-semibold transition-colors"
                  >
                    Older updates
                    <ArrowRightIcon aria-hidden="true" className="size-4" />
                  </Link>
                )}
              </nav>
            )}
          </section>
        )}
      </div>
    </>
  )
}
