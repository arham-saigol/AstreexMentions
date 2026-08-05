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
    default: "Astreex — Customer signal, made clear",
    template: "%s · Astreex",
  },
  description:
    "Astreex organizes customer conversations into clear, actionable signals for focused review.",
  applicationName: "Astreex",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Astreex",
    title: "Astreex — Customer signal, made clear",
    description:
      "Organize customer conversations into clear, actionable signals for focused review.",
  },
  twitter: {
    card: "summary",
    title: "Astreex — Customer signal, made clear",
    description:
      "Organize customer conversations into clear, actionable signals for focused review.",
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
      className={`${geist.variable} ${newsreader.variable} ${jetBrainsMono.variable}`}
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
