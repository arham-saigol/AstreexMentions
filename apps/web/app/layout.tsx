import type { Metadata, Viewport } from "next"
import { Geist, JetBrains_Mono, Newsreader } from "next/font/google"
import type { ReactNode } from "react"

import { Providers } from "@/components/providers"
import { getRuntimeConfiguration, getSiteUrl } from "@/lib/env"

import "./globals.css"

const siteUrl = getSiteUrl()

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
})

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  display: "swap",
  style: ["normal", "italic"],
})

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
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
  colorScheme: "light",
  themeColor: "#f7f6f3",
}

export default function RootLayout({ children }: { children: ReactNode }) {
  const configuration = getRuntimeConfiguration()

  return (
    <html
      lang="en"
      data-theme="light"
      data-astryx-theme="neutral"
      className={`${geist.variable} ${jetBrainsMono.variable} ${newsreader.variable}`}
      suppressHydrationWarning
    >
      <body>
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
