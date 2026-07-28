import type { Metadata } from "next"
import type { ReactNode } from "react"

import { ProtectedProductLayout } from "@/components/product/protected-product-layout"

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <ProtectedProductLayout destination="/app">
      {children}
    </ProtectedProductLayout>
  )
}
