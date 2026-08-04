import { AstreexWordmark } from "@astreex/ui/components/astreex-wordmark"
import Link from "next/link"

const links = [
  ["Product", "/#product"],
  ["Pricing", "/#pricing"],
  ["Notes", "/blog"],
  ["Changelog", "/changelog"],
  ["Sign in", "/sign-in"],
] as const

export function SiteFooter() {
  return (
    <footer className="bg-secondary border-t">
      <div className="mx-auto flex w-full max-w-[1184px] flex-col gap-8 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <div>
          <Link href="/" aria-label="Astreex home">
            <AstreexWordmark />
          </Link>
          <p className="text-muted-foreground mt-3 max-w-sm text-sm">
            Customer conversations, made actionable.
          </p>
        </div>
        <nav aria-label="Footer navigation">
          <ul className="flex flex-wrap gap-x-6 gap-y-3">
            {links.map(([label, href]) => (
              <li key={label}>
                <Link
                  href={href}
                  className="text-muted-foreground hover:text-foreground text-sm transition-colors duration-[var(--motion-control)]"
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="border-t">
        <div className="text-muted-foreground mx-auto flex w-full max-w-[1184px] flex-wrap justify-between gap-2 px-4 py-4 text-xs sm:px-6 lg:px-8">
          <span>© {new Date().getFullYear()} Astreex</span>
          <span>Monitor deliberately. Act in context.</span>
        </div>
      </div>
    </footer>
  )
}
