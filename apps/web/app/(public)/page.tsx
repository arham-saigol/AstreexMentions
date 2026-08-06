import { ArrowRight, Check } from "lucide-react"
import {
  NewspaperClippingIcon,
  RedditLogoIcon,
  XLogoIcon,
} from "@phosphor-icons/react/dist/ssr"
import { PLAN_DEFINITIONS } from "@astreex/domain/plans"
import { Badge } from "@astreex/ui/components/badge"
import { Button } from "@astreex/ui/components/button"
import Link from "next/link"

import { FaqAccordion } from "@/components/transitions/faq-accordion"
import { PressButton } from "@/components/motion/press-button"
import { Stagger } from "@/components/transitions/stagger"
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

const features: Array<{
  label: string
  title: string
  body?: string
  spans?: string
  badges?: string[]
}> = [
  {
    label: "Intent-first queue",
    title: "The conversations that need a response surface first.",
    body: "Questions, complaints, praise, bugs, and requests arrive in one calm queue instead of a raw feed.",
    spans: "lg:col-span-2",
  },
  {
    label: "Daily digest",
    title: "09:00",
    body: "In your local timezone",
  },
  {
    label: "Saved views",
    title: "Recurring questions, one click away.",
  },
  {
    label: "Custom categories",
    title: "Shape the catalog to your business.",
    spans: "lg:col-span-2",
    badges: ["Onboarding friction", "Pricing objection", "Integration request"],
  },
]

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
      {/* Hero -------------------------------------------------------------- */}
      <section className="relative overflow-hidden border-b">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-40 right-0 size-[44rem] bg-[radial-gradient(circle_at_70%_40%,var(--color-accent-muted),transparent_62%)] opacity-70"
        />
        <div className="relative mx-auto grid w-full max-w-[1180px] gap-16 px-5 py-24 min-[1081px]:grid-cols-[1.05fr_1fr] min-[1081px]:items-center sm:px-8 lg:px-16 lg:py-28">
          <Stagger>
            <p className="editorial-eyebrow">
              Customer conversations, made actionable
            </p>
            <h1 className="t-stagger-line text-foreground mt-6 max-w-[14ch] text-[clamp(2.75rem,5.4vw,4.5rem)] leading-[1.02] font-semibold tracking-[-0.03em] text-balance">
              Hear what the market is telling you.
            </h1>
            <p className="t-stagger-line t-stagger-line--2 text-muted-foreground mt-7 max-w-[52ch] text-lg leading-[1.6]">
              Astreex finds the conversations around your keywords across X,
              Reddit, and Hacker News, organizes them by intent, and keeps the
              original context close enough to act with confidence.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <PressButton href="/sign-up">
                Start monitoring
                <ArrowRight className="size-4" aria-hidden="true" />
              </PressButton>
              <Button asChild size="lg" variant="ghost">
                <Link href="#product">See how it works</Link>
              </Button>
            </div>
            <p className="text-muted-foreground mt-5 text-sm">
              Plans start at $19 / month. Cancel any time.
            </p>
          </Stagger>

          <Reveal
            index={1}
            className="bg-card overflow-hidden rounded-xl border shadow-sm min-[1081px]:shadow-md"
          >
            <div className="bg-muted flex items-center gap-2 border-b px-4 py-3">
              <span className="bg-border size-[11px] rounded-full" />
              <span className="bg-border size-[11px] rounded-full" />
              <span className="bg-border size-[11px] rounded-full" />
              <span className="text-muted-foreground ml-3 text-xs">
                astreex.com / app / mentions
              </span>
            </div>
            <div className="p-4 sm:p-5">
              <SignalPreview />
            </div>
          </Reveal>
        </div>
      </section>

      {/* Workflow ---------------------------------------------------------- */}
      <section id="product" className="scroll-mt-16 border-b">
        <div className="mx-auto w-full max-w-[1180px] px-5 py-24 sm:px-8 lg:px-16">
          <div className="grid gap-12 min-[1081px]:grid-cols-[0.75fr_1fr] min-[1081px]:gap-20">
            <Reveal>
              <p className="editorial-eyebrow">The review loop</p>
              <h2 className="mt-4 max-w-[13ch] text-4xl leading-[1.05] font-semibold tracking-[-0.025em] sm:text-5xl">
                From scattered noise to a clear next move.
              </h2>
            </Reveal>
            <ol className="border-t">
              {workflow.map(([number, title, description], i) => (
                <li
                  key={number}
                  className="grid grid-cols-[2.5rem_1fr] gap-4 border-b py-6"
                >
                  <span className="text-muted-foreground/70 mt-1 text-xs font-semibold tracking-wide">
                    {number}
                  </span>
                  <Reveal index={i}>
                    <h3 className="text-xl font-semibold tracking-[-0.01em]">
                      {title}
                    </h3>
                    <p className="text-muted-foreground mt-2 max-w-[58ch] text-sm leading-6">
                      {description}
                    </p>
                  </Reveal>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* Sources ------------------------------------------------------------ */}
      <section id="how-it-works" className="bg-muted/40 scroll-mt-16 border-b">
        <div className="mx-auto w-full max-w-[1180px] px-5 py-24 sm:px-8 lg:px-16">
          <p className="editorial-eyebrow">Sources</p>
          <div className="mt-4 grid gap-8 min-[1081px]:grid-cols-[0.9fr_1fr] min-[1081px]:items-end min-[1081px]:gap-20">
            <h2 className="max-w-[12ch] text-4xl leading-[1.05] font-semibold tracking-[-0.025em] sm:text-5xl">
              Source context stays attached.
            </h2>
            <p className="text-muted-foreground max-w-[58ch] text-base leading-7">
              A category is a clue, not an answer. Astreex keeps the author,
              source, time, excerpt, engagement, and original link visible
              before its interpretation.
            </p>
          </div>
          <div className="bg-border mt-14 grid gap-px overflow-hidden rounded-xl border min-[1081px]:grid-cols-3">
            {sources.map(([name, description, Icon], i) => (
              <Reveal key={name} index={i} className="bg-card h-full p-7">
                <span className="bg-muted text-muted-foreground grid size-10 place-items-center rounded-lg">
                  <Icon aria-hidden="true" className="size-5" weight="bold" />
                </span>
                <h3 className="mt-5 text-xl font-semibold tracking-[-0.01em]">
                  {name}
                </h3>
                <p className="text-muted-foreground mt-2 text-sm leading-6">
                  {description}
                </p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Features ----------------------------------------------------------- */}
      <section id="features" className="scroll-mt-16 border-b">
        <div className="mx-auto w-full max-w-[1180px] px-5 py-24 sm:px-8 lg:px-16">
          <p className="editorial-eyebrow">Built for a daily habit</p>
          <h2 className="mt-4 max-w-[14ch] text-4xl leading-[1.05] font-semibold tracking-[-0.025em] sm:text-5xl">
            Review less. Notice more.
          </h2>
          <div className="mt-12 grid gap-4 lg:grid-cols-3">
            {features.map((f, i) => (
              <Reveal
                key={f.label}
                index={i % 3}
                className={`surface-hover bg-card rounded-lg border p-7 ${f.spans ?? ""}`}
              >
                <p className="text-muted-foreground/80 text-xs font-semibold tracking-[0.1em] uppercase">
                  {f.label}
                </p>
                <h3 className="mt-4 text-2xl font-semibold tracking-[-0.02em]">
                  {f.title}
                </h3>
                {f.body && (
                  <p className="text-muted-foreground mt-3 max-w-2xl text-sm leading-6">
                    {f.body}
                  </p>
                )}
                {f.badges && (
                  <div className="mt-5 flex flex-wrap gap-2">
                    {f.badges.map((b) => (
                      <Badge key={b} variant="muted">
                        {b}
                      </Badge>
                    ))}
                  </div>
                )}
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing ------------------------------------------------------------ */}
      <section id="pricing" className="bg-muted/40 scroll-mt-16 border-b">
        <div className="mx-auto w-full max-w-[1180px] px-5 py-24 sm:px-8 lg:px-16">
          <p className="editorial-eyebrow">Pricing</p>
          <h2 className="mt-4 text-4xl font-semibold tracking-[-0.025em] sm:text-5xl">
            Choose by volume.
          </h2>
          <p className="text-muted-foreground mt-4 max-w-2xl text-base leading-7">
            Every plan includes the full product. Only keywords and monthly
            mention volume change.
          </p>
          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {PLAN_DEFINITIONS.map((plan, index) => {
              const popular = index === 1
              return (
                <article
                  key={plan.id}
                  className={`bg-card flex flex-col rounded-xl border p-7 transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 ${
                    popular
                      ? "border-accent ring-accent/40 shadow-sm ring-1"
                      : "border-border hover:shadow-sm"
                  }`}
                >
                  {popular && (
                    <Badge variant="secondary" className="mb-4 w-fit">
                      Most popular
                    </Badge>
                  )}
                  <p className="text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase">
                    {plan.name}
                  </p>
                  <p className="mt-3 text-5xl font-semibold tracking-[-0.03em]">
                    ${plan.priceUsd}
                    <span className="text-muted-foreground ml-1 text-sm font-normal tracking-normal">
                      / month
                    </span>
                  </p>
                  <p className="text-muted-foreground mt-4 text-sm leading-6">
                    {index === 0
                      ? "For a single brand finding its first conversations."
                      : index === 1
                        ? "For teams tracking their brand and a few competitors."
                        : "For a brand, competitors, and problem phrases."}
                  </p>
                  <ul className="text-muted-foreground mt-6 flex-1 text-sm">
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
                        <Check
                          className="text-accent-foreground mt-0.5 size-4 shrink-0"
                          aria-hidden="true"
                        />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Button
                    asChild
                    className="mt-7 w-full"
                    variant={popular ? "default" : "outline"}
                  >
                    <Link href="/sign-up">
                      Start with {plan.name}
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </Link>
                  </Button>
                </article>
              )
            })}
          </div>
        </div>
      </section>

      {/* FAQ ---------------------------------------------------------------- */}
      <section id="faq" className="scroll-mt-16 border-b">
        <div className="mx-auto grid w-full max-w-[1180px] gap-10 px-5 py-24 min-[1081px]:grid-cols-[0.55fr_1fr] min-[1081px]:gap-20 sm:px-8 lg:px-16">
          <div>
            <p className="editorial-eyebrow">FAQ</p>
            <h2 className="mt-4 text-4xl font-semibold tracking-[-0.025em]">
              Before you start.
            </h2>
          </div>
          <FaqAccordion items={faqs} />
        </div>
      </section>

      {/* Closing CTA ------------------------------------------------------- */}
      <section>
        <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-8 px-5 py-16 sm:px-8 md:flex-row md:items-center md:justify-between lg:px-16">
          <h2 className="max-w-[16ch] text-4xl font-semibold tracking-[-0.03em]">
            Find the conversation worth joining.
          </h2>
          <Button asChild size="lg">
            <Link href="/sign-up">
              Start monitoring
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </section>
    </div>
  )
}
