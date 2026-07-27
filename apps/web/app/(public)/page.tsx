import {
  ArrowRightIcon,
  BellRingingIcon,
  BroadcastIcon,
  CheckIcon,
  EyeIcon,
  NewspaperClippingIcon,
  RedditLogoIcon,
  SlidersHorizontalIcon,
  XLogoIcon,
} from "@phosphor-icons/react/dist/ssr"
import { Badge } from "@astreex/ui/components/badge"
import { Button } from "@astreex/ui/components/button"
import Link from "next/link"

import { ActivationPreview } from "@/components/marketing/activation-preview"
import { CapabilityShowcase } from "@/components/marketing/capability-showcase"
import { SectionHeading } from "@/components/marketing/section-heading"
import { SignalPreview } from "@/components/marketing/signal-preview"

const sources = [
  {
    name: "X",
    description:
      "Track public posts around your brand, product language, competitors, and the problems your customers describe.",
    icon: XLogoIcon,
  },
  {
    name: "Reddit",
    description:
      "Follow focused community conversations where people compare tools, ask for advice, and explain what is not working.",
    icon: RedditLogoIcon,
  },
  {
    name: "Hacker News",
    description:
      "Catch technical discussions, launch reactions, and candid product feedback without repeatedly searching each thread.",
    icon: NewspaperClippingIcon,
  },
] as const

const activationSteps = [
  {
    title: "Configure the listening scope",
    description:
      "Choose the sources, keywords, product terms, and competitor language that belong in your monitoring workflow.",
    icon: SlidersHorizontalIcon,
  },
  {
    title: "Review what will be collected",
    description:
      "Confirm the scope and exclusions before monitoring begins, so the queue starts useful instead of merely full.",
    icon: EyeIcon,
  },
  {
    title: "Activate the review rhythm",
    description:
      "Turn on monitoring, save the views you return to, and set a digest cadence that keeps review consistent.",
    icon: BellRingingIcon,
  },
] as const

const plans = [
  { name: "Starter", price: "$19" },
  { name: "Growth", price: "$99" },
  { name: "Scale", price: "$199" },
] as const

const includedFeatures = [
  "X, Reddit, and Hacker News monitoring",
  "Configurable keywords and source scope",
  "AI-assisted mention categorization",
  "Reusable saved views",
  "Daily email digests",
  "The complete Astreex feature set",
] as const

const faqs = [
  {
    question: "Which conversations can Astreex monitor?",
    answer:
      "Astreex brings configured monitoring from X, Reddit, and Hacker News into one review workflow. You choose the keywords and source scope that are relevant to your product, market, or competitors.",
  },
  {
    question: "What does configuration-first activation mean?",
    answer:
      "Monitoring does not begin from a vague default. You first configure sources, keywords, exclusions, and digest settings, review that scope, and then activate it. This creates a more deliberate signal from the start.",
  },
  {
    question: "How does AI categorization help?",
    answer:
      "Astreex labels mentions by intent, including questions, complaints, praise, bugs, feature requests, competitor mentions, and other conversation. Categories make the queue easier to review; you still decide what deserves action.",
  },
  {
    question: "What are saved views for?",
    answer:
      "Saved views preserve combinations of sources, keywords, and categories. They are useful for returning to launch feedback, a product area, competitor discussion, or any recurring research question without rebuilding the scope.",
  },
  {
    question: "What is included in a digest?",
    answer:
      "Digests provide a concise review of recent categorized mentions with enough source context to understand the signal and follow the underlying conversations when more detail is needed.",
  },
  {
    question: "Is Astreex a paid product?",
    answer:
      "Yes. Astreex plans are Starter at $19 per month, Growth at $99 per month, and Scale at $199 per month. Every plan includes every product feature.",
  },
] as const

export default function HomePage() {
  return (
    <>
      <section className="border-border relative overflow-hidden border-b">
        <div className="mx-auto grid w-full max-w-6xl gap-12 px-6 py-16 sm:py-20 lg:grid-cols-[minmax(0,0.9fr)_minmax(25rem,0.78fr)] lg:items-center lg:gap-16 lg:py-24">
          <div>
            <Badge variant="outline" className="gap-1.5 px-3 py-1">
              <BroadcastIcon aria-hidden="true" weight="fill" />
              Monitor X, Reddit, and Hacker News
            </Badge>
            <h1 className="text-foreground mt-6 max-w-3xl text-4xl font-semibold tracking-[-0.04em] text-balance sm:text-5xl lg:text-6xl">
              Find the conversations that should shape your next move.
            </h1>
            <p className="text-muted-foreground mt-6 max-w-2xl text-lg leading-8 text-pretty">
              Astreex turns scattered posts and threads into a focused customer
              signal—configured around your keywords, organized by intent, and
              ready for you to review.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link href="/sign-up">
                  Get started
                  <ArrowRightIcon aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/sign-in">Sign in</Link>
              </Button>
            </div>
            <p className="text-muted-foreground mt-4 text-xs leading-5">
              Paid plans start at $19/month. Every plan includes every feature.
            </p>
          </div>

          <SignalPreview />
        </div>
      </section>

      <section id="product" className="scroll-mt-20">
        <div className="mx-auto w-full max-w-6xl px-6 py-20 sm:py-24">
          <SectionHeading
            eyebrow="One cross-platform signal"
            title="Listen where product conversations actually happen."
            description="Search behavior changes from platform to platform. Astreex gives those conversations a shared structure without stripping away the source context that makes them useful."
            aside={
              <p className="border-primary text-muted-foreground border-l-2 pl-4 text-sm leading-6">
                Configure each source intentionally, then review everything in
                one consistent queue.
              </p>
            }
          />

          <div className="border-border mt-12 grid border-y md:grid-cols-3 md:divide-x">
            {sources.map(({ name, description, icon: Icon }) => (
              <article
                key={name}
                className="border-border border-b py-7 last:border-b-0 md:border-b-0 md:px-7 md:first:pl-0 md:last:pr-0"
              >
                <div className="flex items-center gap-3">
                  <div className="border-border bg-muted text-foreground grid size-10 place-items-center rounded-lg border">
                    <Icon aria-hidden="true" className="size-5" weight="bold" />
                  </div>
                  <h3 className="text-foreground text-lg font-semibold">
                    {name}
                  </h3>
                </div>
                <p className="text-muted-foreground mt-4 text-sm leading-6">
                  {description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        id="how-it-works"
        className="border-border bg-muted/30 scroll-mt-20 border-y"
      >
        <div className="mx-auto grid w-full max-w-6xl gap-12 px-6 py-20 sm:py-24 lg:grid-cols-[minmax(0,0.95fr)_minmax(22rem,0.75fr)] lg:items-center lg:gap-20">
          <div>
            <p className="text-primary text-sm font-semibold tracking-wide uppercase">
              Configuration-first activation
            </p>
            <h2 className="text-foreground mt-3 text-3xl font-semibold tracking-[-0.025em] text-balance sm:text-4xl">
              Define a useful signal before you turn it on.
            </h2>
            <p className="text-muted-foreground mt-4 max-w-2xl text-base leading-7 sm:text-lg">
              Astreex starts with deliberate setup, not an uncontrolled stream.
              You can see what will be monitored and how it will be delivered
              before activation.
            </p>

            <ol className="border-border mt-9 border-t">
              {activationSteps.map(
                ({ title, description, icon: Icon }, index) => (
                  <li
                    key={title}
                    className="border-border grid grid-cols-[auto_1fr] gap-4 border-b py-5"
                  >
                    <div className="border-border bg-background text-primary grid size-9 place-items-center rounded-md border">
                      <Icon aria-hidden="true" className="size-4" />
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                        Step {index + 1}
                      </p>
                      <h3 className="text-foreground mt-1 text-base font-semibold">
                        {title}
                      </h3>
                      <p className="text-muted-foreground mt-2 text-sm leading-6">
                        {description}
                      </p>
                    </div>
                  </li>
                ),
              )}
            </ol>
          </div>

          <ActivationPreview />
        </div>
      </section>

      <section id="features" className="scroll-mt-20">
        <div className="mx-auto w-full max-w-6xl px-6 py-20 sm:py-24">
          <SectionHeading
            eyebrow="Built for review"
            title="Turn a noisy feed into a repeatable review habit."
            description="Astreex helps you move from collection to understanding with practical structure at each step of the review."
          />
          <CapabilityShowcase />
        </div>
      </section>

      <section
        id="pricing"
        className="border-border bg-muted/30 scroll-mt-20 border-y"
      >
        <div className="mx-auto w-full max-w-6xl px-6 py-20 sm:py-24">
          <SectionHeading
            eyebrow="Paid plans"
            title="Straightforward pricing. The full product on every plan."
            description="Choose Starter, Growth, or Scale. Astreex does not separate core monitoring, categorization, saved views, or digests into feature-gated tiers."
            aside={
              <div className="flex items-start gap-3">
                <CheckIcon
                  aria-hidden="true"
                  weight="bold"
                  className="text-primary mt-1 size-4 shrink-0"
                />
                <p className="text-muted-foreground text-sm leading-6">
                  Every listed feature is included at every price point.
                </p>
              </div>
            }
          />

          <div className="border-border bg-background mt-12 grid overflow-hidden rounded-xl border shadow-sm md:grid-cols-3 md:divide-x">
            {plans.map((plan) => (
              <article
                key={plan.name}
                className="border-border flex flex-col border-b p-6 last:border-b-0 md:border-b-0 lg:p-7"
              >
                <h3 className="text-foreground text-base font-semibold">
                  {plan.name}
                </h3>
                <p className="mt-5 flex items-baseline gap-1">
                  <span className="text-foreground text-4xl font-semibold tracking-[-0.03em]">
                    {plan.price}
                  </span>
                  <span className="text-muted-foreground text-sm">/ month</span>
                </p>
                <p className="text-muted-foreground mt-3 flex-1 text-sm leading-6">
                  The complete Astreex feature set, including all supported
                  sources and workflows.
                </p>
                <Button asChild className="mt-6 w-full" variant="outline">
                  <Link href="/sign-up">Choose {plan.name}</Link>
                </Button>
              </article>
            ))}
          </div>

          <div className="mt-8 grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            {includedFeatures.map((feature) => (
              <div
                key={feature}
                className="text-muted-foreground flex items-start gap-2.5 text-sm leading-6"
              >
                <CheckIcon
                  aria-hidden="true"
                  weight="bold"
                  className="text-primary mt-1 size-4 shrink-0"
                />
                <span>{feature}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="scroll-mt-20">
        <div className="mx-auto grid w-full max-w-6xl gap-12 px-6 py-20 sm:py-24 lg:grid-cols-[minmax(16rem,0.55fr)_minmax(0,1fr)] lg:gap-20">
          <div>
            <p className="text-primary text-sm font-semibold tracking-wide uppercase">
              Frequently asked questions
            </p>
            <h2 className="text-foreground mt-3 text-3xl font-semibold tracking-[-0.025em] text-balance sm:text-4xl">
              Details before you get started.
            </h2>
            <p className="text-muted-foreground mt-4 text-base leading-7">
              A clear monitoring workflow starts with clear expectations about
              sources, setup, product behavior, and pricing.
            </p>
          </div>

          <div className="border-border border-t">
            {faqs.map(({ question, answer }) => (
              <details key={question} className="group border-border border-b">
                <summary className="text-foreground flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-left text-sm font-semibold marker:hidden sm:text-base [&::-webkit-details-marker]:hidden">
                  {question}
                  <span
                    aria-hidden="true"
                    className="border-border text-muted-foreground grid size-6 shrink-0 place-items-center rounded-full border text-base font-normal transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="text-muted-foreground max-w-3xl pr-10 pb-5 text-sm leading-6 sm:text-base sm:leading-7">
                  {answer}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="border-border border-t">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-6 py-16 sm:py-20 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <p className="text-primary text-sm font-semibold tracking-wide uppercase">
              A clearer listening practice
            </p>
            <h2 className="text-foreground mt-3 max-w-2xl text-3xl font-semibold tracking-[-0.025em] text-balance sm:text-4xl">
              Bring the conversations worth reviewing into one place.
            </h2>
            <p className="text-muted-foreground mt-4 max-w-2xl text-base leading-7">
              Configure the signal you need, then build a consistent habit
              around categorization, saved views, and digests.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 md:justify-end">
            <Button asChild size="lg">
              <Link href="/sign-up">
                Get started
                <ArrowRightIcon aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/sign-in">Sign in</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  )
}
