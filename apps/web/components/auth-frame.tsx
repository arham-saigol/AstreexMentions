import { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr"
import { AstreexWordmark } from "@astreex/ui/components/astreex-wordmark"
import Link from "next/link"
import type { ReactNode } from "react"

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
    <main className="bg-background grid min-h-dvh lg:grid-cols-[minmax(24rem,0.82fr)_minmax(32rem,1fr)]">
      <aside className="relative overflow-hidden border-b bg-[var(--canvas-soft)] lg:border-r lg:border-b-0">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-40 -right-40 size-[36rem] bg-[radial-gradient(circle,color-mix(in_srgb,var(--accent)_14%,transparent),transparent_64%)]"
        />
        <div className="relative mx-auto flex h-full w-full max-w-xl flex-col px-6 py-7 sm:px-10 lg:px-12 lg:py-10">
          <Link href="/" aria-label="Astreex home" className="w-fit">
            <AstreexWordmark />
          </Link>
          <div className="my-auto hidden py-10 lg:block lg:py-16">
            <p className="editorial-eyebrow">{eyebrow}</p>
            <h1 className="font-display mt-4 max-w-[13ch] text-4xl leading-[1.02] font-medium tracking-[-0.04em] text-balance sm:text-5xl">
              {title}
            </h1>
            <p className="mt-5 max-w-lg text-sm leading-6 text-[var(--ink-secondary)] sm:text-base sm:leading-7">
              {description}
            </p>
            <div className="text-muted-foreground mt-10 flex flex-wrap gap-x-5 gap-y-2 font-mono text-xs">
              <span>X</span>
              <span>Reddit</span>
              <span>Hacker News</span>
            </div>
          </div>
          <p className="text-muted-foreground hidden font-mono text-xs leading-5 lg:block">
            Original context stays attached.
          </p>
        </div>
      </aside>

      <section className="bg-card relative flex min-h-[calc(100dvh-77px)] items-center justify-center px-6 py-16 sm:px-8 lg:min-h-[36rem]">
        <div className="absolute top-5 right-5 flex items-center gap-1 sm:top-7 sm:right-7">
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground inline-flex h-10 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors duration-[var(--motion-control)]"
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
