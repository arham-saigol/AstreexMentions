import {
  ArrowLeftIcon,
  CheckCircleIcon,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
} from "@phosphor-icons/react/dist/ssr"
import { AstreexWordmark } from "@astreex/ui/components/astreex-wordmark"
import { ThemeToggle } from "@astreex/ui/components/theme-toggle"
import Link from "next/link"
import type { ReactNode } from "react"

const authPrinciples = [
  {
    title: "Configure before collecting",
    description: "Choose the sources and keywords that belong in your signal.",
    icon: SlidersHorizontalIcon,
  },
  {
    title: "Keep the source context",
    description:
      "Review each conversation with the details needed to act well.",
    icon: ShieldCheckIcon,
  },
  {
    title: "Use the complete product",
    description: "Every paid plan includes every Astreex feature.",
    icon: CheckCircleIcon,
  },
] as const

type AuthFrameProps = {
  children: ReactNode
  eyebrow: string
  title: string
  description: string
  contentWidth?: "form" | "status"
}

export function AuthFrame({
  children,
  eyebrow,
  title,
  description,
  contentWidth = "form",
}: AuthFrameProps) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[minmax(22rem,0.78fr)_minmax(32rem,1fr)]">
      <aside className="border-border bg-muted/25 border-b lg:border-r lg:border-b-0">
        <div className="mx-auto flex h-full w-full max-w-xl flex-col px-6 py-7 sm:px-8 lg:px-10 lg:py-10">
          <Link href="/" aria-label="Astreex home" className="w-fit">
            <AstreexWordmark />
          </Link>

          <div className="my-auto py-10 lg:py-16">
            <p className="text-primary text-xs font-semibold tracking-wide uppercase">
              {eyebrow}
            </p>
            <h1 className="text-foreground mt-3 max-w-lg text-3xl font-semibold tracking-[-0.03em] text-balance sm:text-4xl">
              {title}
            </h1>
            <p className="text-muted-foreground mt-4 max-w-lg text-sm leading-6 sm:text-base sm:leading-7">
              {description}
            </p>

            <ul className="border-border mt-8 hidden border-t sm:block">
              {authPrinciples.map(
                ({
                  title: itemTitle,
                  description: itemDescription,
                  icon: Icon,
                }) => (
                  <li
                    key={itemTitle}
                    className="border-border grid grid-cols-[auto_1fr] gap-3 border-b py-4"
                  >
                    <span className="border-border bg-background text-primary mt-0.5 grid size-8 place-items-center rounded-md border">
                      <Icon aria-hidden="true" className="size-4" />
                    </span>
                    <span>
                      <span className="text-foreground block text-sm font-semibold">
                        {itemTitle}
                      </span>
                      <span className="text-muted-foreground mt-1 block text-xs leading-5">
                        {itemDescription}
                      </span>
                    </span>
                  </li>
                ),
              )}
            </ul>
          </div>

          <p className="text-muted-foreground hidden text-xs leading-5 lg:block">
            Starter $19 · Growth $99 · Scale $199 per month
          </p>
        </div>
      </aside>

      <section className="relative flex min-h-[36rem] items-center justify-center px-6 py-16 sm:px-8">
        <div className="absolute top-5 right-5 flex items-center gap-1 sm:top-7 sm:right-7">
          <ThemeToggle />
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors"
          >
            <ArrowLeftIcon aria-hidden="true" className="size-3.5" />
            Public site
          </Link>
        </div>

        <div
          className={
            contentWidth === "status"
              ? "w-full max-w-xl"
              : "flex w-full max-w-md justify-center"
          }
        >
          {children}
        </div>
      </section>
    </main>
  )
}
