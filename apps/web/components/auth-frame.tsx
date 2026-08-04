import { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr"
import { AstreexWordmark } from "@astreex/ui/components/astreex-wordmark"
import { ThemeToggle } from "@astreex/ui/components/theme-toggle"
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
    <main className="grid min-h-dvh lg:grid-cols-[minmax(24rem,0.82fr)_minmax(32rem,1fr)]">
      <aside className="bg-primary text-primary-foreground border-b lg:border-r lg:border-b-0">
        <div className="mx-auto flex h-full w-full max-w-xl flex-col px-6 py-7 sm:px-10 lg:px-12 lg:py-10">
          <Link href="/" aria-label="Astreex home" className="w-fit">
            <AstreexWordmark
              className="text-primary-foreground"
              markClassName="text-primary-foreground"
            />
          </Link>
          <div className="my-auto py-10 lg:py-16">
            <p className="text-sm font-semibold opacity-75">{eyebrow}</p>
            <h1 className="mt-4 max-w-[13ch] text-4xl leading-[1.02] font-semibold tracking-[-0.045em] text-balance sm:text-5xl">
              {title}
            </h1>
            <p className="mt-5 max-w-lg text-sm leading-6 opacity-75 sm:text-base sm:leading-7">
              {description}
            </p>
            <div className="mt-10 flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium opacity-75">
              <span>X</span>
              <span>Reddit</span>
              <span>Hacker News</span>
            </div>
          </div>
          <p className="hidden text-xs leading-5 opacity-70 lg:block">
            Original context stays attached.
          </p>
        </div>
      </aside>

      <section className="bg-card relative flex min-h-[36rem] items-center justify-center px-6 py-16 sm:px-8">
        <div className="absolute top-5 right-5 flex items-center gap-1 sm:top-7 sm:right-7">
          <ThemeToggle />
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
