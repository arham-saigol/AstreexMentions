import type { Metadata, Viewport } from "next"
import { Geist, JetBrains_Mono, Newsreader } from "next/font/google"
import type { ReactNode } from "react"

import { Providers } from "@/components/providers"
import { readAdminPublicEnv } from "@/lib/env"

import "./globals.css"

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
  colorScheme: "light",
  themeColor: "#f7f6f3",
}

export default function RootLayout({ children }: { children: ReactNode }) {
  const publicEnv = readAdminPublicEnv()

  return (
    <html
      lang="en"
      data-theme="light"
      data-astryx-theme="neutral"
      className={`${geist.variable} ${newsreader.variable} ${jetBrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body>
        <Providers {...publicEnv}>{children}</Providers>
      </body>
    </html>
  )
}
