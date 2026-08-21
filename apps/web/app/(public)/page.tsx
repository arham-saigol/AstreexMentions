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
    "Choose your keywords",
    "Track your brand, products, competitors, and the phrases that customers use to describe their problems.",
  ],
  [
    "02",
    "Start with the right mentions",
    "AI keeps clearly unrelated results in a reviewable Filtered view, then assigns priority and a category to the rest.",
  ],
  [
    "03",
    "Read the original conversation",
    "Open the source, save the mention for later, or remove it from your queue.",
  ],
] as const

const sources = [
  ["X", "Track public posts about your brand, product, or market.", XLogoIcon],
  [
    "Reddit",
    "Find questions and candid feedback in relevant communities.",
    RedditLogoIcon,
  ],
  [
    "Hacker News",
    "Follow technical discussions, launch reactions, and product feedback.",
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
    label: "Categories by intent",
    title: "See questions, complaints, and bugs first.",
    body: "Astreex sorts matching posts into a focused queue, so you do not have to scan a raw feed.",
    spans: "lg:col-span-2",
  },
  {
    label: "Daily digest",
    title: "Around 09:00 local time",
    body: "Set your account timezone",
  },
  {
    label: "Saved views",
    title: "Return to the mentions you review often.",
  },
  {
    label: "Custom categories",
    title: "Organize mentions around your business.",
    spans: "lg:col-span-2",
    badges: ["Onboarding friction", "Pricing objection", "Integration request"],
  },
]

const faqs = [
  [
    "What can Astreex monitor?",
    "Astreex tracks the keywords that you choose across X, Reddit, and Hacker News. Coverage and update frequency depend on the source and your plan.",
  ],
  [
    "How does Astreex categorize mentions?",
    "AI checks relevance, assigns low, medium, or high priority, and sorts each mention into a built-in or custom category. Filtered results remain reviewable.",
  ],
  [
    "What changes between plans?",
    "Every plan includes all product features. Plans differ by keyword and mention capacity. A mention counts when Astreex collects it, including a result later kept in the reviewable Filtered view.",
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
              Keyword monitoring for customer conversations
            </p>
            <h1 className="t-stagger-line text-foreground mt-6 max-w-[14ch] text-[clamp(2.75rem,5.4vw,4.5rem)] leading-[1.02] font-semibold tracking-[-0.03em] text-balance">
              Find the customer conversations worth your attention.
            </h1>
            <p className="t-stagger-line t-stagger-line--2 text-muted-foreground mt-7 max-w-[52ch] text-lg leading-[1.6]">
              Track keywords across X, Reddit, and Hacker News. AI filters
              clearly unrelated results, assigns priority, and categorizes the
              conversations worth reviewing.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <PressButton href="/sign-up">
                Start monitoring
                <ArrowRight className="size-4" aria-hidden="true" />
              </PressButton>
              <Button asChild size="lg" variant="ghost">
                <Link href="#product">See how Astreex works</Link>
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
              <p className="editorial-eyebrow">How Astreex works</p>
              <h2 className="mt-4 max-w-[13ch] text-4xl leading-[1.05] font-semibold tracking-[-0.025em] sm:text-5xl">
                Turn scattered mentions into a daily review queue.
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
              Read every mention in context.
            </h2>
            <p className="text-muted-foreground max-w-[58ch] text-base leading-7">
              A category helps you decide what to read first. The author,
              source, time, excerpt, engagement, and original link stay with
              every mention.
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
          <p className="editorial-eyebrow">A focused daily review</p>
          <h2 className="mt-4 max-w-[14ch] text-4xl leading-[1.05] font-semibold tracking-[-0.025em] sm:text-5xl">
            Know what needs your attention first.
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
            Pick the volume that fits.
          </h2>
          <p className="text-muted-foreground mt-4 max-w-2xl text-base leading-7">
            Every plan includes all product features. Choose how many keywords
            and mentions you want to monitor each month. First 100 mentions
            free.
          </p>
          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {PLAN_DEFINITIONS.map((plan, index) => {
              const popular = index === 1
              return (
                <article
                  key={plan.id}
                  className={`bg-card flex flex-col rounded-[var(--radius-lg)] border p-7 transition-[border-color,box-shadow,transform] duration-[var(--motion-control)] ease-[var(--ease-out)] hover:-translate-y-1 hover:shadow-[var(--shadow-md)] ${
                    popular
                      ? "border-[color-mix(in_srgb,var(--accent)_55%,var(--line))] shadow-[var(--shadow-md)] ring-1 ring-[color-mix(in_srgb,var(--accent)_32%,transparent)]"
                      : "border-border hover:border-[var(--line-strong)]"
                  }`}
                >
                  {popular && (
                    <Badge variant="secondary" className="mb-4 w-fit">
                      Most popular
                    </Badge>
                  )}
                  <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase">
                    {plan.name}
                  </p>
                  <p className="mt-3 text-[44px] font-semibold tracking-[-0.04em]">
                    ${plan.priceUsd}
                    <span className="text-muted-foreground ml-1.5 text-sm font-normal tracking-normal">
                      / month
                    </span>
                  </p>
                  <p className="text-muted-foreground mt-4 text-sm leading-6">
                    {index === 0
                      ? "For one brand and the conversations around it."
                      : index === 1
                        ? "For teams that track their brand and key competitors."
                        : "For broad coverage of a brand, competitors, and customer problems."}
                  </p>
                  <ul className="text-muted-foreground mt-6 flex-1 text-sm">
                    {[
                      `${plan.keywordLimit} monitored keywords`,
                      `${plan.monthlyMentionLimit.toLocaleString()} mentions / month`,
                      "X, Reddit, Hacker News",
                      "Built-in and custom categories",
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
              Questions before you start
            </h2>
          </div>
          <FaqAccordion items={faqs} />
        </div>
      </section>

      {/* Closing CTA ------------------------------------------------------- */}
      <section>
        <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-8 px-5 py-16 sm:px-8 md:flex-row md:items-center md:justify-between lg:px-16">
          <h2 className="max-w-[16ch] text-4xl font-semibold tracking-[-0.03em]">
            Start with the keywords that matter to your business.
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
