import {
  ArrowLeftIcon,
  CalendarBlankIcon,
} from "@phosphor-icons/react/dist/ssr"
import { Badge } from "@astreex/ui/components/badge"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import type { ComponentPropsWithoutRef } from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import rehypeSanitize from "rehype-sanitize"
import remarkGfm from "remark-gfm"

import { ChangelogState } from "@/components/changelog-state"
import {
  changelogDateTime,
  formatChangelogDate,
  getPublishedChangelogEntry,
} from "@/lib/changelog"
import { getSiteUrl } from "@/lib/env"

type ChangelogEntryPageProps = {
  params: Promise<{ slug: string }>
}

export const dynamic = "force-dynamic"

export async function generateMetadata({
  params,
}: ChangelogEntryPageProps): Promise<Metadata> {
  const { slug } = await params
  const result = await getPublishedChangelogEntry(slug)

  if (result.state !== "ready") {
    return {
      title: "Product changelog",
      description: "Published Astreex product updates.",
      robots: { index: false, follow: true },
    }
  }

  const entry = result.entry

  if (!entry) {
    notFound()
  }

  const canonicalPath = `/changelog/${entry.slug}`

  return {
    title: entry.title,
    description: entry.summary,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      type: "article",
      url: canonicalPath,
      title: entry.title,
      description: entry.summary,
      publishedTime: changelogDateTime(entry.publishedAt),
      modifiedTime: changelogDateTime(entry.updatedAt ?? entry.publishedAt),
    },
    twitter: {
      card: "summary",
      title: entry.title,
      description: entry.summary,
    },
  }
}

function MarkdownLink({ href = "", children }: ComponentPropsWithoutRef<"a">) {
  const isExternal = href.startsWith("http://") || href.startsWith("https://")

  return (
    <a
      href={href}
      className="text-primary decoration-primary/40 hover:decoration-primary font-medium underline underline-offset-4 transition-colors"
      target={isExternal ? "_blank" : undefined}
      rel={isExternal ? "noopener noreferrer" : undefined}
    >
      {children}
    </a>
  )
}

const markdownComponents: Components = {
  h2: ({ children }) => (
    <h2 className="font-display text-foreground mt-11 text-3xl font-medium tracking-[-0.02em] text-balance sm:text-4xl">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="font-display text-foreground mt-8 text-2xl font-medium tracking-[-0.02em] text-balance sm:text-3xl">
      {children}
    </h3>
  ),
  p: ({ children }) => (
    <p className="mt-5 text-base leading-8 text-[var(--ink-secondary)] sm:text-[1.0625rem]">
      {children}
    </p>
  ),
  a: MarkdownLink,
  strong: ({ children }) => (
    <strong className="text-foreground font-semibold">{children}</strong>
  ),
  ul: ({ children }) => (
    <ul className="mt-5 ml-5 list-disc space-y-2 text-base leading-7 text-[var(--ink-secondary)] marker:text-[var(--signal)] sm:text-[1.0625rem]">
      {children}
    </ul>
  ),
  ol: ({ children, start }) => (
    <ol
      start={start}
      className="marker:text-foreground mt-5 ml-5 list-decimal space-y-2 text-base leading-7 text-[var(--ink-secondary)] marker:font-semibold sm:text-[1.0625rem]"
    >
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="pl-1.5">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="border-primary bg-muted/45 [&>p]:text-foreground my-8 border-l-2 py-1 pr-5 pl-5 [&>p]:mt-0">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="border-border my-10" />,
  pre: ({ children }) => (
    <pre className="border-border bg-muted text-foreground my-7 overflow-x-auto rounded-lg border p-4 text-sm leading-6 [&>code]:bg-transparent [&>code]:p-0">
      {children}
    </pre>
  ),
  code: ({ children, className }) => (
    <code
      className={`${className ?? ""} bg-muted text-foreground rounded px-1.5 py-0.5 font-mono text-[0.875em]`}
    >
      {children}
    </code>
  ),
  img: () => null,
}

export default async function ChangelogEntryPage({
  params,
}: ChangelogEntryPageProps) {
  const { slug } = await params
  const result = await getPublishedChangelogEntry(slug)

  if (result.state !== "ready") {
    return (
      <div className="mx-auto w-full max-w-6xl px-6 py-12 sm:py-16">
        <Link
          href="/changelog"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 text-sm font-medium transition-colors"
        >
          <ArrowLeftIcon aria-hidden="true" className="size-4" />
          Product changelog
        </Link>
        <div className="mt-9">
          <ChangelogState state={result.state} />
        </div>
      </div>
    )
  }

  const entry = result.entry

  if (!entry) {
    notFound()
  }

  const siteUrl = getSiteUrl()
  const canonicalUrl = new URL(`/changelog/${entry.slug}`, siteUrl).toString()
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: entry.title,
    description: entry.summary,
    datePublished: changelogDateTime(entry.publishedAt),
    dateModified: changelogDateTime(entry.updatedAt ?? entry.publishedAt),
    mainEntityOfPage: canonicalUrl,
    author: {
      "@type": "Organization",
      name: "Astreex",
    },
    publisher: {
      "@type": "Organization",
      name: "Astreex",
      url: siteUrl.origin,
    },
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
        }}
      />

      <header className="border-border border-b">
        <div className="mx-auto w-full max-w-6xl px-6 py-12 sm:py-16">
          <Link
            href="/changelog"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 text-sm font-medium transition-colors"
          >
            <ArrowLeftIcon aria-hidden="true" className="size-4" />
            All product changes
          </Link>

          <div className="mt-9 max-w-4xl">
            <Badge variant="outline">Published update</Badge>
            <h1 className="font-display text-foreground mt-5 text-5xl font-medium tracking-[-0.035em] text-balance sm:text-6xl">
              {entry.title}
            </h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-pretty text-[var(--ink-secondary)]">
              {entry.summary}
            </p>
            <div className="text-muted-foreground mt-7 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <time
                dateTime={changelogDateTime(entry.publishedAt)}
                className="flex items-center gap-2"
              >
                <CalendarBlankIcon aria-hidden="true" className="size-4" />
                Published {formatChangelogDate(entry.publishedAt)}
              </time>
              {entry.updatedAt && entry.updatedAt !== entry.publishedAt && (
                <>
                  <span aria-hidden="true" className="text-border">
                    /
                  </span>
                  <time dateTime={changelogDateTime(entry.updatedAt)}>
                    Updated {formatChangelogDate(entry.updatedAt)}
                  </time>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-6xl gap-12 px-6 py-12 sm:py-16 lg:grid-cols-[minmax(0,46rem)_minmax(13rem,1fr)] lg:gap-16">
        <article>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeSanitize]}
            components={markdownComponents}
          >
            {entry.body}
          </ReactMarkdown>
        </article>

        <aside className="border-border border-t pt-7 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-7">
          <div className="lg:sticky lg:top-24">
            <p className="text-foreground text-sm font-semibold">
              Entry details
            </p>
            <dl className="mt-4 space-y-4 text-sm">
              <div>
                <dt className="text-muted-foreground">Status</dt>
                <dd className="text-foreground mt-1 font-medium">Published</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Published</dt>
                <dd className="text-foreground mt-1 font-medium">
                  {formatChangelogDate(entry.publishedAt)}
                </dd>
              </div>
              {entry.updatedAt && entry.updatedAt !== entry.publishedAt && (
                <div>
                  <dt className="text-muted-foreground">Last updated</dt>
                  <dd className="text-foreground mt-1 font-medium">
                    {formatChangelogDate(entry.updatedAt)}
                  </dd>
                </div>
              )}
            </dl>

            <div className="border-border mt-8 border-t pt-7">
              <Link
                href="/changelog"
                className="text-primary hover:text-primary/80 inline-flex items-center gap-2 text-sm font-semibold transition-colors"
              >
                <ArrowLeftIcon aria-hidden="true" className="size-4" />
                All published updates
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </>
  )
}
