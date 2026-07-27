import { ArrowRightIcon, ClockIcon } from "@phosphor-icons/react/dist/ssr"
import { Badge } from "@astreex/ui/components/badge"
import type { Metadata } from "next"
import Link from "next/link"

import { formatBlogDate, getAllBlogPosts } from "@/lib/blog"

export const metadata: Metadata = {
  title: "Field notes on customer signal",
  description:
    "Practical guides for monitoring customer conversations, building better keyword strategies, and turning mentions into action.",
  alternates: {
    canonical: "/blog",
  },
  openGraph: {
    type: "website",
    url: "/blog",
    title: "Field notes on customer signal · Astreex",
    description:
      "Practical, detailed guidance for building a dependable customer-signal practice.",
  },
  twitter: {
    card: "summary",
    title: "Field notes on customer signal · Astreex",
    description:
      "Practical, detailed guidance for building a dependable customer-signal practice.",
  },
}

export default function BlogIndexPage() {
  const posts = getAllBlogPosts()

  return (
    <>
      <section className="border-border border-b">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-16 sm:py-20 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-end">
          <div className="max-w-3xl">
            <Badge variant="outline">Astreex field notes</Badge>
            <h1 className="text-foreground mt-5 text-4xl font-semibold tracking-[-0.03em] text-balance sm:text-5xl">
              Better systems for listening to customers.
            </h1>
            <p className="text-muted-foreground mt-5 max-w-2xl text-lg leading-8 text-pretty">
              Detailed, practical guidance for finding useful conversations,
              improving the signal, and giving every important mention a clear
              next step.
            </p>
          </div>

          <div className="border-border border-l pl-6">
            <p className="text-foreground text-sm font-semibold">
              Written for people doing the work
            </p>
            <p className="text-muted-foreground mt-2 text-sm leading-6">
              No trend summaries or vague playbooks. Each article includes a
              process you can inspect, adapt, and put into practice.
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="latest-articles">
        <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-primary text-sm font-semibold">The library</p>
              <h2
                id="latest-articles"
                className="text-foreground mt-2 text-2xl font-semibold tracking-tight sm:text-3xl"
              >
                Practical guides, carefully explained.
              </h2>
            </div>
            <p className="text-muted-foreground text-sm">
              {posts.length} in-depth{" "}
              {posts.length === 1 ? "article" : "articles"}
            </p>
          </div>

          <ol className="border-border mt-10 divide-y border-y">
            {posts.map((post) => (
              <li key={post.slug}>
                <article>
                  <Link
                    href={`/blog/${post.slug}`}
                    className="group grid gap-5 py-7 sm:py-8 md:grid-cols-[10.5rem_minmax(0,1fr)_auto] md:items-start md:gap-8"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-primary text-xs font-semibold tracking-wide uppercase">
                          {post.category}
                        </span>
                        {post.featured && (
                          <Badge
                            variant="secondary"
                            className="h-5 px-1.5 text-[0.625rem]"
                          >
                            Featured
                          </Badge>
                        )}
                      </div>
                      <time
                        dateTime={post.publishedAt}
                        className="text-muted-foreground mt-2 block text-sm"
                      >
                        {formatBlogDate(post.publishedAt)}
                      </time>
                    </div>

                    <div>
                      <h3 className="text-foreground group-hover:text-primary text-xl font-semibold tracking-tight text-balance transition-colors sm:text-2xl">
                        {post.title}
                      </h3>
                      <p className="text-muted-foreground mt-3 max-w-3xl text-sm leading-6 sm:text-base sm:leading-7">
                        {post.description}
                      </p>
                      <span className="text-muted-foreground mt-4 flex items-center gap-1.5 text-xs">
                        <ClockIcon aria-hidden="true" className="size-3.5" />
                        {post.readingTimeMinutes} min read
                      </span>
                    </div>

                    <span className="border-border text-muted-foreground group-hover:border-primary/40 group-hover:text-primary grid size-9 place-items-center rounded-full border transition-colors md:mt-1">
                      <ArrowRightIcon aria-hidden="true" className="size-4" />
                      <span className="sr-only">Read {post.title}</span>
                    </span>
                  </Link>
                </article>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </>
  )
}
