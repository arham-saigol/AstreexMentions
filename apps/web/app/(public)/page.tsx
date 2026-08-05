import {
  ArrowRightIcon,
  CheckIcon,
  NewspaperClippingIcon,
  RedditLogoIcon,
  XLogoIcon,
} from "@phosphor-icons/react/dist/ssr"
import { PLAN_DEFINITIONS } from "@astreex/domain/plans"
import { Badge } from "@astreex/ui/components/badge"
import { Button } from "@astreex/ui/components/button"
import Link from "next/link"

import { Reveal } from "@/components/marketing/reveal"
import { SignalPreview } from "@/components/marketing/signal-preview"

const workflow = [
  [
    "01",
    "Choose what matters",
    "Add your brand, products, competitors, and the problems customers describe.",
  ],
  [
    "02",
    "Review by intent",
    "Questions, complaints, praise, bugs, and requests arrive in one calm queue.",
  ],
  [
    "03",
    "Act while it matters",
    "Open the original conversation, save it for later, or clear it from view.",
  ],
] as const

const sources = [
  ["X", "Public posts, product language, and competitor shifts.", XLogoIcon],
  [
    "Reddit",
    "Questions and candid conversations in the communities that matter.",
    RedditLogoIcon,
  ],
  [
    "Hacker News",
    "Technical discussions, launch reactions, and product feedback.",
    NewspaperClippingIcon,
  ],
] as const

const faqs = [
  [
    "Which conversations can Astreex monitor?",
    "Astreex monitors configured keywords across X, Reddit, and Hacker News. Coverage and collection cadence depend on the source and your plan limits.",
  ],
  [
    "How does categorization work?",
    "Astreex categorizes collected mentions with AI into questions, complaints, praise, bugs, feature requests, competitor mentions, and your custom categories. The original post always stays visible.",
  ],
  [
    "What do plans change?",
    "Every plan includes the full product. Plans differ by monitored keywords and monthly mention volume.",
  ],
] as const

export default function HomePage() {
  return (
    <div className="bg-background">
      <section className="relative overflow-hidden border-b bg-[var(--canvas-soft)]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-48 -right-40 size-[52rem] bg-[radial-gradient(circle_at_60%_40%,rgba(183,121,58,0.10),transparent_62%)]"
        />
        <div className="relative mx-auto grid w-full max-w-[1180px] gap-14 px-5 py-20 min-[1081px]:grid-cols-[1.05fr_1fr] min-[1081px]:items-center min-[1081px]:gap-16 sm:px-8 sm:py-24 lg:px-16 lg:py-28">
          <Reveal>
            <p className="editorial-eyebrow">
              Customer conversations, made actionable
            </p>
            <h1 className="font-display mt-5 max-w-[14ch] text-[clamp(3rem,5.4vw,4.6rem)] leading-[0.98] font-medium tracking-[-0.04em] text-balance">
              Hear what the market is telling you.
            </h1>
            <p className="mt-7 max-w-[52ch] text-lg leading-[1.6] text-[var(--ink-secondary)]">
              Astreex finds the conversations around your keywords across X,
              Reddit, and Hacker News, organizes them by intent, and keeps the
              original context close enough to act with confidence.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link href="/sign-up">
                  Start monitoring <ArrowRightIcon aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="ghost">
                <Link href="#product">See how it works</Link>
              </Button>
            </div>
            <p className="text-muted-foreground mt-4 font-mono text-xs">
              Plans start at $19 / month. Cancel any time.
            </p>
          </Reveal>

          <Reveal
            index={1}
            className="bg-card overflow-hidden rounded-lg border shadow-[0_12px_40px_rgba(27,26,24,0.06)]"
          >
            <div className="flex items-center gap-2 border-b bg-[var(--canvas-soft)] px-4 py-3">
              <span className="size-[11px] rounded-full bg-[var(--line-strong)]" />
              <span className="size-[11px] rounded-full bg-[var(--line-strong)]" />
              <span className="size-[11px] rounded-full bg-[var(--line-strong)]" />
              <span className="text-muted-foreground ml-3 font-mono text-[11px]">
                astreex.com / app / mentions
              </span>
            </div>
            <div className="p-4 sm:p-[18px]">
              <SignalPreview />
            </div>
          </Reveal>
        </div>
      </section>

      <section id="product" className="scroll-mt-16 border-b">
        <div className="mx-auto w-full max-w-[1180px] px-5 py-20 sm:px-8 sm:py-24 lg:px-16 lg:py-28">
          <div className="grid gap-12 min-[1081px]:grid-cols-[0.75fr_1fr] min-[1081px]:gap-20">
            <div>
              <p className="editorial-eyebrow">The review loop</p>
              <h2 className="font-display mt-4 max-w-[13ch] text-4xl leading-[1.04] font-medium tracking-[-0.03em] sm:text-5xl">
                From scattered noise to a clear next move.
              </h2>
            </div>
            <ol className="border-t">
              {workflow.map(([number, title, description]) => (
                <li
                  key={number}
                  className="grid grid-cols-[2.5rem_1fr] gap-4 border-b py-6"
                >
                  <span className="font-mono text-[11px] tracking-[0.1em] text-[var(--ink-faint)]">
                    {number}
                  </span>
                  <div>
                    <h3 className="font-display text-xl font-medium tracking-[-0.02em]">
                      {title}
                    </h3>
                    <p className="mt-2 max-w-[58ch] text-sm leading-6 text-[var(--ink-secondary)]">
                      {description}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section
        id="how-it-works"
        className="scroll-mt-16 border-b bg-[var(--canvas-soft)]"
      >
        <div className="mx-auto w-full max-w-[1180px] px-5 py-20 sm:px-8 sm:py-24 lg:px-16 lg:py-28">
          <p className="editorial-eyebrow">Sources</p>
          <div className="mt-4 grid gap-8 min-[1081px]:grid-cols-[0.9fr_1fr] min-[1081px]:items-end min-[1081px]:gap-20">
            <h2 className="font-display max-w-[12ch] text-4xl leading-[1.04] font-medium tracking-[-0.03em] sm:text-5xl">
              Source context stays attached.
            </h2>
            <p className="max-w-[58ch] text-base leading-7 text-[var(--ink-secondary)]">
              A category is a clue, not an answer. Astreex keeps the author,
              source, time, excerpt, engagement, and original link visible
              before its interpretation.
            </p>
          </div>
          <div className="bg-border mt-14 grid gap-px overflow-hidden rounded-xl border min-[1081px]:grid-cols-3">
            {sources.map(([name, description, Icon]) => (
              <article key={name} className="bg-card p-7">
                <span className="bg-muted grid size-9 place-items-center rounded-md text-[var(--ink-secondary)]">
                  <Icon aria-hidden="true" className="size-5" weight="bold" />
                </span>
                <h3 className="font-display mt-5 text-xl font-medium tracking-[-0.02em]">
                  {name}
                </h3>
                <p className="mt-2 text-sm leading-6 text-[var(--ink-secondary)]">
                  {description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="scroll-mt-16 border-b">
        <div className="mx-auto w-full max-w-[1180px] px-5 py-20 sm:px-8 sm:py-24 lg:px-16 lg:py-28">
          <p className="editorial-eyebrow">Built for a daily habit</p>
          <h2 className="font-display mt-4 max-w-[14ch] text-4xl leading-[1.04] font-medium tracking-[-0.03em] sm:text-5xl">
            Review less. Notice more.
          </h2>
          <div className="mt-12 grid gap-4 min-[1081px]:grid-cols-3">
            <article className="surface-hover bg-card rounded-lg border p-7 min-[1081px]:col-span-2">
              <p className="font-mono text-[11px] tracking-[0.12em] text-[var(--ink-faint)] uppercase">
                Intent-first queue
              </p>
              <h3 className="font-display mt-4 text-3xl font-medium tracking-[-0.025em]">
                The conversations that need a response surface first.
              </h3>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--ink-secondary)]">
                Questions, complaints, praise, bugs, and requests arrive in one
                calm queue instead of a raw feed.
              </p>
            </article>
            <article className="surface-hover bg-card rounded-lg border p-7">
              <p className="font-mono text-[11px] tracking-[0.12em] text-[var(--ink-faint)] uppercase">
                Daily digest
              </p>
              <p className="font-display mt-5 text-4xl font-medium tracking-[-0.03em]">
                09:00
              </p>
              <p className="text-muted-foreground mt-2 text-xs">
                In your local timezone
              </p>
            </article>
            <article className="surface-hover bg-card rounded-lg border p-7">
              <p className="font-mono text-[11px] tracking-[0.12em] text-[var(--ink-faint)] uppercase">
                Saved views
              </p>
              <h3 className="font-display mt-4 text-2xl font-medium tracking-[-0.02em]">
                Recurring questions, one click away.
              </h3>
            </article>
            <article className="surface-hover bg-card rounded-lg border p-7 min-[1081px]:col-span-2">
              <p className="font-mono text-[11px] tracking-[0.12em] text-[var(--ink-faint)] uppercase">
                Custom categories
              </p>
              <h3 className="font-display mt-4 text-2xl font-medium tracking-[-0.02em]">
                Shape the catalog to your business.
              </h3>
              <div className="mt-5 flex flex-wrap gap-2">
                <Badge variant="muted">Onboarding friction</Badge>
                <Badge variant="muted">Pricing objection</Badge>
                <Badge variant="muted">Integration request</Badge>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section
        id="pricing"
        className="scroll-mt-16 border-b bg-[var(--canvas-soft)]"
      >
        <div className="mx-auto w-full max-w-[1180px] px-5 py-20 sm:px-8 sm:py-24 lg:px-16 lg:py-28">
          <p className="editorial-eyebrow">Pricing</p>
          <h2 className="font-display mt-4 text-4xl font-medium tracking-[-0.03em] sm:text-5xl">
            Choose by volume.
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--ink-secondary)]">
            Every plan includes the full product. Only keywords and monthly
            mention volume change.
          </p>
          <div className="mt-10 grid gap-4 min-[1081px]:grid-cols-3">
            {PLAN_DEFINITIONS.map((plan, index) => (
              <article
                key={plan.id}
                className={`bg-card flex flex-col rounded-lg border p-7 ${index === 1 ? "border-foreground shadow-sm" : "border-border"}`}
              >
                {index === 1 && (
                  <Badge variant="secondary" className="mb-4">
                    Most popular
                  </Badge>
                )}
                <p className="text-muted-foreground font-mono text-[11px] tracking-[0.12em] uppercase">
                  {plan.name}
                </p>
                <p className="font-display mt-3 text-5xl font-medium tracking-[-0.03em]">
                  ${plan.priceUsd}
                  <span className="text-muted-foreground font-sans text-sm font-normal tracking-normal">
                    {" "}
                    / month
                  </span>
                </p>
                <p className="mt-4 text-sm leading-6 text-[var(--ink-secondary)]">
                  {index === 0
                    ? "For a single brand finding its first conversations."
                    : index === 1
                      ? "For teams tracking their brand and a few competitors."
                      : "For a brand, competitors, and problem phrases."}
                </p>
                <ul className="mt-6 flex-1 text-sm text-[var(--ink-secondary)]">
                  {[
                    `${plan.keywordLimit} monitored keywords`,
                    `${plan.monthlyMentionLimit.toLocaleString()} mentions / month`,
                    "X, Reddit, Hacker News",
                    "All categories and custom",
                    "Daily digest",
                  ].map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2.5 border-b py-2 last:border-b-0"
                    >
                      <CheckIcon
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0"
                        weight="bold"
                      />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Button
                  asChild
                  className="mt-7 w-full"
                  variant={index === 1 ? "default" : "outline"}
                >
                  <Link href="/sign-up">Start with {plan.name}</Link>
                </Button>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="scroll-mt-16 border-b">
        <div className="mx-auto grid w-full max-w-[1180px] gap-10 px-5 py-20 min-[1081px]:grid-cols-[0.55fr_1fr] min-[1081px]:gap-20 sm:px-8 sm:py-24 lg:px-16 lg:py-28">
          <div>
            <p className="editorial-eyebrow">FAQ</p>
            <h2 className="font-display mt-4 text-4xl font-medium tracking-[-0.03em]">
              Before you start.
            </h2>
          </div>
          <div className="border-t">
            {faqs.map(([question, answer]) => (
              <details key={question} className="group border-b">
                <summary className="font-display flex min-h-18 list-none items-center justify-between gap-6 py-5 text-xl font-medium tracking-[-0.01em] marker:hidden [&::-webkit-details-marker]:hidden">
                  {question}
                  <span
                    aria-hidden="true"
                    className="text-muted-foreground font-mono text-2xl font-normal transition-transform duration-[var(--motion-overlay)] group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="max-w-2xl pb-6 text-sm leading-6 text-[var(--ink-secondary)]">
                  {answer}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-8 px-5 py-16 sm:px-8 md:flex-row md:items-center md:justify-between lg:px-16">
          <h2 className="font-display max-w-[16ch] text-4xl font-medium tracking-[-0.03em]">
            Find the conversation worth joining.
          </h2>
          <Button asChild size="lg">
            <Link href="/sign-up">
              Start monitoring <ArrowRightIcon aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </section>
    </div>
  )
}
