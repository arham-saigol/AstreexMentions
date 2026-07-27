import { AstreexWordmark } from "@astreex/ui/components/astreex-wordmark"
import Link from "next/link"

const footerLinks = [
  {
    title: "Product",
    links: [
      ["Sources", "/#product"],
      ["How it works", "/#how-it-works"],
      ["Features", "/#features"],
      ["Pricing", "/#pricing"],
      ["Field notes", "/blog"],
      ["Changelog", "/changelog"],
    ],
  },
  {
    title: "Access",
    links: [
      ["Get started", "/sign-up"],
      ["Sign in", "/sign-in"],
      ["FAQ", "/#faq"],
    ],
  },
] as const

export function SiteFooter() {
  return (
    <footer className="border-border border-t">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-12 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:gap-16">
        <div>
          <Link href="/" aria-label="Astreex home">
            <AstreexWordmark />
          </Link>
          <p className="text-muted-foreground mt-4 max-w-sm text-sm leading-6">
            Cross-platform customer signal from X, Reddit, and Hacker News,
            organized for a focused review habit.
          </p>
          <p className="text-muted-foreground mt-4 text-xs leading-5">
            Paid plans: Starter $19 · Growth $99 · Scale $199 per month.
          </p>
        </div>

        {footerLinks.map((group) => (
          <nav key={group.title} aria-label={`${group.title} links`}>
            <p className="text-foreground text-sm font-semibold">
              {group.title}
            </p>
            <ul className="mt-3 space-y-2.5">
              {group.links.map(([label, href]) => (
                <li key={label}>
                  <Link
                    href={href}
                    className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-border border-t">
        <div className="text-muted-foreground mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-6 py-4 text-xs">
          <span>
            © {new Date().getFullYear()} Astreex. All rights reserved.
          </span>
          <span>Monitor deliberately. Review consistently.</span>
        </div>
      </div>
    </footer>
  )
}
