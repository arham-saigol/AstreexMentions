import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ClockIcon,
} from "@phosphor-icons/react/dist/ssr"
import { Badge } from "@astreex/ui/components/badge"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import type { ComponentPropsWithoutRef } from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import rehypeSanitize from "rehype-sanitize"
import remarkGfm from "remark-gfm"

import {
  formatBlogDate,
  getAllBlogPosts,
  getBlogPostBySlug,
  getBlogPostSlugs,
} from "@/lib/blog"
import { getSiteUrl } from "@/lib/env"

type BlogPostPageProps = {
  params: Promise<{ slug: string }>
}

export const dynamicParams = false

export function generateStaticParams() {
  return getBlogPostSlugs().map((slug) => ({ slug }))
}

export async function generateMetadata({
  params,
}: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params
  const post = getBlogPostBySlug(slug)

  if (!post) {
    notFound()
  }

  const canonicalPath = `/blog/${post.slug}`

  return {
    title: post.title,
    description: post.description,
    keywords: post.keywords,
    authors: [{ name: post.author }],
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      type: "article",
      url: canonicalPath,
      title: post.title,
      description: post.description,
      publishedTime: `${post.publishedAt}T00:00:00.000Z`,
      modifiedTime: `${post.updatedAt ?? post.publishedAt}T00:00:00.000Z`,
      authors: [post.author],
      tags: [post.category, ...post.keywords],
    },
    twitter: {
      card: "summary",
      title: post.title,
      description: post.description,
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
    <h2 className="font-display text-foreground mt-12 text-3xl font-medium tracking-[-0.02em] text-balance sm:text-4xl">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="font-display text-foreground mt-9 text-2xl font-medium tracking-[-0.02em] text-balance sm:text-3xl">
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
  table: ({ children }) => (
    <div
      role="region"
      aria-label="Scrollable data table"
      tabIndex={0}
      className="border-border my-8 max-w-full overflow-x-auto rounded-lg border focus-visible:outline-offset-2"
    >
      <table className="w-full min-w-[38rem] border-collapse text-left text-sm">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted/70">{children}</thead>,
  tbody: ({ children }) => (
    <tbody className="divide-border divide-y">{children}</tbody>
  ),
  tr: ({ children }) => <tr>{children}</tr>,
  th: ({ children, style }) => (
    <th
      style={style}
      className="text-foreground border-border border-r px-4 py-3 font-semibold last:border-r-0"
    >
      {children}
    </th>
  ),
  td: ({ children, style }) => (
    <td
      style={style}
      className="border-border border-r px-4 py-3 align-top leading-6 text-[var(--ink-secondary)] last:border-r-0"
    >
      {children}
    </td>
  ),
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params
  const post = getBlogPostBySlug(slug)

  if (!post) {
    notFound()
  }

  const relatedPosts = getAllBlogPosts()
    .filter((candidate) => candidate.slug !== post.slug)
    .slice(0, 2)
  const siteUrl = getSiteUrl()
  const canonicalUrl = new URL(`/blog/${post.slug}`, siteUrl).toString()
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt ?? post.publishedAt,
    mainEntityOfPage: canonicalUrl,
    author: {
      "@type": "Organization",
      name: post.author,
    },
    publisher: {
      "@type": "Organization",
      name: "Astreex",
      url: siteUrl.origin,
    },
    keywords: post.keywords.join(", "),
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
            href="/blog"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 text-sm font-medium transition-colors"
          >
            <ArrowLeftIcon aria-hidden="true" className="size-4" />
            All field notes
          </Link>

          <div className="mt-9 max-w-4xl">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="outline">{post.category}</Badge>
              <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
                <ClockIcon aria-hidden="true" className="size-4" />
                {post.readingTimeMinutes} min read
              </span>
            </div>
            <h1 className="font-display text-foreground mt-5 text-5xl font-medium tracking-[-0.035em] text-balance sm:text-6xl">
              {post.title}
            </h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-pretty text-[var(--ink-secondary)]">
              {post.description}
            </p>
            <div className="text-muted-foreground mt-7 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <span>By {post.author}</span>
              <span aria-hidden="true" className="text-border">
                /
              </span>
              <time dateTime={post.publishedAt}>
                {formatBlogDate(post.publishedAt)}
              </time>
              {post.updatedAt && (
                <>
                  <span aria-hidden="true" className="text-border">
                    /
                  </span>
                  <span>Updated {formatBlogDate(post.updatedAt)}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-6xl gap-12 px-6 py-12 sm:py-16 lg:grid-cols-[minmax(0,46rem)_minmax(13rem,1fr)] lg:gap-16">
        <article className="min-w-0">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeSanitize]}
            components={markdownComponents}
          >
            {post.content}
          </ReactMarkdown>
        </article>

        <aside className="border-border border-t pt-7 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-7">
          <div className="lg:sticky lg:top-24">
            <p className="text-foreground text-sm font-semibold">
              Article details
            </p>
            <dl className="mt-4 space-y-4 text-sm">
              <div>
                <dt className="text-muted-foreground">Topic</dt>
                <dd className="text-foreground mt-1 font-medium">
                  {post.category}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Length</dt>
                <dd className="text-foreground mt-1 font-medium">
                  {post.wordCount.toLocaleString("en-US")} words
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Published</dt>
                <dd className="text-foreground mt-1 font-medium">
                  {formatBlogDate(post.publishedAt)}
                </dd>
              </div>
            </dl>

            {relatedPosts.length > 0 && (
              <div className="border-border mt-8 border-t pt-7">
                <p className="text-foreground text-sm font-semibold">
                  Read next
                </p>
                <ul className="mt-4 space-y-5">
                  {relatedPosts.map((relatedPost) => (
                    <li key={relatedPost.slug}>
                      <Link
                        href={`/blog/${relatedPost.slug}`}
                        className="group block"
                      >
                        <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                          {relatedPost.category}
                        </span>
                        <span className="text-foreground group-hover:text-primary mt-1.5 block text-sm leading-5 font-semibold transition-colors">
                          {relatedPost.title}
                        </span>
                        <span className="text-muted-foreground mt-2 flex items-center gap-1.5 text-xs">
                          Read article
                          <ArrowRightIcon
                            aria-hidden="true"
                            className="size-3.5 transition-transform group-hover:translate-x-0.5"
                          />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </aside>
      </div>
    </>
  )
}
