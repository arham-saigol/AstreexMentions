import type { Metadata, Viewport } from "next"
import type { ReactNode } from "react"

import { Providers } from "@/components/providers"
import { readAdminPublicEnv } from "@/lib/env"

import "./globals.css"

export const metadata: Metadata = {
  title: {
    default: "Astreex Admin",
    template: "%s | Astreex Admin",
  },
  description: "Restricted Astreex operations console.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
}

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f9fb" },
    { media: "(prefers-color-scheme: dark)", color: "#1d2026" },
  ],
}

export default function RootLayout({ children }: { children: ReactNode }) {
  const publicEnv = readAdminPublicEnv()

  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers {...publicEnv}>{children}</Providers>
      </body>
    </html>
  )
}
