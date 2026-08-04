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

import { SignalPreview } from "@/components/marketing/signal-preview"

const sources = [
  ["X", "Public posts, product language, competitors", XLogoIcon],
  ["Reddit", "Questions and candid community conversations", RedditLogoIcon],
  [
    "Hacker News",
    "Technical discussions and launch reactions",
    NewspaperClippingIcon,
  ],
] as const

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
    <>
      <section className="overflow-hidden border-b">
        <div className="mx-auto grid min-h-[calc(100svh-4rem)] w-full max-w-[1184px] gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,0.88fr)_minmax(28rem,0.9fr)] lg:items-center lg:gap-16 lg:px-8 lg:py-24">
          <div className="relative">
            <span
              aria-hidden="true"
              className="bg-primary absolute top-1 bottom-1 -left-4 w-0.5 sm:-left-6"
            />
            <p className="text-primary text-[13px] font-semibold">
              Customer conversations, made actionable
            </p>
            <h1 className="font-display mt-5 max-w-[12ch] text-[clamp(3.25rem,6.5vw,5.4rem)] leading-[0.94] font-semibold tracking-[-0.055em] text-balance">
              Hear what the market is telling you.
            </h1>
            <p className="text-muted-foreground mt-7 max-w-[58ch] text-lg leading-7">
              Astreex finds the conversations around your keywords, organizes
              them by intent, and keeps the original context close enough to act
              with confidence.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/sign-up">
                  Start monitoring <ArrowRightIcon aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="ghost">
                <Link href="#product">See how it works</Link>
              </Button>
            </div>
            <p className="text-muted-foreground mt-4 text-xs">
              Plans start at $19/month. Cancel any time.
            </p>
          </div>

          <div className="bg-primary -mx-4 px-4 py-8 sm:-mx-6 sm:px-8 sm:py-10 lg:m-0 lg:rounded-xl lg:p-8">
            <SignalPreview />
          </div>
        </div>
      </section>

      <section id="product" className="scroll-mt-20 border-b">
        <div className="mx-auto w-full max-w-[1184px] px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1fr)] lg:gap-20">
            <div>
              <p className="text-primary text-[13px] font-semibold">
                The review loop
              </p>
              <h2 className="mt-3 max-w-[13ch] text-4xl leading-[1.02] font-semibold tracking-[-0.04em] sm:text-5xl">
                From scattered noise to a clear next move.
              </h2>
            </div>
            <ol className="border-t">
              {workflow.map(([number, title, description]) => (
                <li
                  key={number}
                  className="grid grid-cols-[2.5rem_1fr] gap-4 border-b py-6"
                >
                  <span className="text-primary font-mono text-xs">
                    {number}
                  </span>
                  <div>
                    <h3 className="text-[15px] font-semibold">{title}</h3>
                    <p className="text-muted-foreground mt-2 max-w-[58ch] text-sm leading-6">
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
        className="bg-foreground text-background scroll-mt-20"
      >
        <div className="mx-auto w-full max-w-[1184px] px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)] lg:items-end lg:gap-20">
            <h2 className="max-w-[12ch] text-4xl leading-[1.02] font-semibold tracking-[-0.04em] sm:text-5xl">
              Source context stays attached.
            </h2>
            <p className="max-w-[58ch] text-base leading-7 opacity-70">
              A category is a clue, not an answer. Astreex keeps the author,
              source, time, excerpt, engagement, and original link visible
              before its interpretation.
            </p>
          </div>
          <div className="mt-16 grid border-y border-current/20 md:grid-cols-3 md:divide-x md:divide-current/20">
            {sources.map(([name, description, Icon]) => (
              <article
                key={name}
                className="border-b border-current/20 py-7 last:border-b-0 md:border-b-0 md:px-7 md:first:pl-0 md:last:pr-0"
              >
                <div className="flex items-center gap-3">
                  <Icon aria-hidden="true" className="size-5" />
                  <h3 className="text-[15px] font-semibold">{name}</h3>
                </div>
                <p className="mt-3 text-sm leading-6 opacity-65">
                  {description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="scroll-mt-20 border-b">
        <div className="mx-auto grid w-full max-w-[1184px] gap-12 px-4 py-20 sm:px-6 sm:py-24 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.72fr)] lg:gap-20 lg:px-8">
          <div>
            <p className="text-primary text-[13px] font-semibold">
              Built for a daily habit
            </p>
            <h2 className="mt-3 max-w-[14ch] text-4xl leading-[1.02] font-semibold tracking-[-0.04em] sm:text-5xl">
              Review less. Notice more.
            </h2>
            <div className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2">
              {[
                [
                  "Saved views",
                  "Keep launch feedback, competitor shifts, or product questions one click away.",
                ],
                [
                  "Custom categories",
                  "Organize conversations around the way your business actually works.",
                ],
                [
                  "Daily digests",
                  "Bring recent mentions into a concise email when you do not need the full queue.",
                ],
                [
                  "Monitoring health",
                  "See which source needs attention without reading provider diagnostics.",
                ],
              ].map(([title, description]) => (
                <article key={title}>
                  <h3 className="text-[15px] font-semibold">{title}</h3>
                  <p className="text-muted-foreground mt-2 text-sm leading-6">
                    {description}
                  </p>
                </article>
              ))}
            </div>
          </div>
          <blockquote className="bg-primary text-primary-foreground flex min-h-80 flex-col justify-between rounded-xl p-8">
            <p className="text-2xl leading-8 font-semibold tracking-[-0.025em]">
              The useful conversation is usually already happening. The hard
              part is finding it in time.
            </p>
            <p className="mt-10 text-sm opacity-80">
              Astreex keeps the next one within reach.
            </p>
          </blockquote>
        </div>
      </section>

      <section id="pricing" className="bg-secondary scroll-mt-20">
        <div className="mx-auto w-full max-w-[1184px] px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-primary text-[13px] font-semibold">Pricing</p>
            <h2 className="mt-3 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
              Choose by volume.
            </h2>
            <p className="text-muted-foreground mt-4 text-base leading-7">
              Every plan includes every workflow. Only keywords and monthly
              mention volume change.
            </p>
          </div>
          <div className="bg-card mt-12 grid overflow-hidden rounded-xl border md:grid-cols-3 md:divide-x">
            {PLAN_DEFINITIONS.map((plan, index) => (
              <article
                key={plan.id}
                className="flex flex-col border-b p-6 last:border-b-0 md:border-b-0 lg:p-8"
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-semibold">{plan.name}</h3>
                  {index === 1 && (
                    <Badge variant="secondary">Most room to grow</Badge>
                  )}
                </div>
                <p className="mt-8">
                  <span className="text-4xl font-semibold tracking-[-0.04em]">
                    ${plan.priceUsd}
                  </span>
                  <span className="text-muted-foreground text-sm">
                    {" "}
                    / month
                  </span>
                </p>
                <ul className="text-muted-foreground mt-6 flex-1 space-y-3 text-sm">
                  <li>{plan.keywordLimit} monitored keywords</li>
                  <li>
                    {plan.monthlyMentionLimit.toLocaleString()} mentions / month
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckIcon
                      aria-hidden="true"
                      className="text-primary size-4"
                    />{" "}
                    All product features
                  </li>
                </ul>
                <Button
                  asChild
                  className="mt-8 w-full"
                  variant={index === 1 ? "default" : "outline"}
                >
                  <Link href="/sign-up">Choose {plan.name}</Link>
                </Button>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="scroll-mt-20 border-t">
        <div className="mx-auto grid w-full max-w-[1184px] gap-10 px-4 py-20 sm:px-6 sm:py-24 lg:grid-cols-[0.55fr_1fr] lg:gap-20 lg:px-8">
          <h2 className="text-3xl font-semibold tracking-[-0.035em]">
            Before you start
          </h2>
          <div className="border-t">
            {faqs.map(([question, answer]) => (
              <details key={question} className="group border-b">
                <summary className="flex min-h-16 list-none items-center justify-between gap-6 py-4 text-[15px] font-semibold marker:hidden [&::-webkit-details-marker]:hidden">
                  {question}
                  <span
                    aria-hidden="true"
                    className="text-muted-foreground text-xl font-normal transition-transform duration-[var(--motion-control)] group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="text-muted-foreground max-w-2xl pb-5 text-sm leading-6">
                  {answer}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto flex w-full max-w-[1184px] flex-col gap-8 px-4 py-16 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <h2 className="max-w-[16ch] text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
            Find the conversation worth joining.
          </h2>
          <Button
            asChild
            size="lg"
            className="bg-card text-foreground hover:bg-secondary"
          >
            <Link href="/sign-up">
              Start monitoring <ArrowRightIcon aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </section>
    </>
  )
}
