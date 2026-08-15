import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import type { ReactNode } from "react"

import { themeScript } from "@astreex/ui/theme-config"

import { Providers } from "@/components/providers"
import { getRuntimeConfiguration, getSiteUrl } from "@/lib/env"

import "./globals.css"

const siteUrl = getSiteUrl()

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
})

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
})

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: {
    default: "Astreex — Customer conversation monitoring",
    template: "%s · Astreex",
  },
  description:
    "Track keywords across X, Reddit, and Hacker News. Astreex sorts matching posts into questions, complaints, praise, bugs, and feature requests.",
  applicationName: "Astreex",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Astreex",
    title: "Astreex — Customer conversation monitoring",
    description:
      "Track keywords across X, Reddit, and Hacker News. Sort matching posts by intent and keep every mention in context.",
  },
  twitter: {
    card: "summary",
    title: "Astreex — Customer conversation monitoring",
    description:
      "Track keywords across X, Reddit, and Hacker News. Sort matching posts by intent and keep every mention in context.",
  },
  robots: {
    index: true,
    follow: true,
  },
}

export const viewport: Viewport = {
  colorScheme: "dark light",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#191919" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
}

export default function RootLayout({ children }: { children: ReactNode }) {
  const configuration = getRuntimeConfiguration()

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geist.variable} ${geistMono.variable}`}
    >
      <body>
        {/* Resolves the theme before first paint so the right token set
            applies with no flash. OS preference by default; an explicit
            choice persists under the key the provider reads. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <Providers
          clerkPublishableKey={configuration.clerk.publishableKey}
          convexUrl={configuration.convex.url}
        >
          {children}
        </Providers>
      </body>
    </html>
  )
}