import type { Metadata, Viewport } from "next"
import type { ReactNode } from "react"

import { Providers } from "@/components/providers"
import { getRuntimeConfiguration, getSiteUrl } from "@/lib/env"

import "./globals.css"

const siteUrl = getSiteUrl()

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
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1016" },
  ],
}

export default function RootLayout({ children }: { children: ReactNode }) {
  const configuration = getRuntimeConfiguration()

  return (
    <html lang="en" suppressHydrationWarning>
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
