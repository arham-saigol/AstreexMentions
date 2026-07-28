import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import type { ReactNode } from "react"

import { ConfigurationRequired } from "@/components/configuration-required"
import { ProductRuntime } from "@/components/product/product-runtime"
import { getRuntimeConfiguration } from "@/lib/env"

export async function ProtectedProductLayout({
  children,
  destination,
}: {
  children: ReactNode
  destination: "/app" | "/onboarding"
}) {
  const configuration = getRuntimeConfiguration()
  const missingServices = [configuration.clerk, configuration.convex].filter(
    (service) => !service.configured,
  )

  if (missingServices.length > 0) {
    return (
      <main className="min-h-dvh">
        <ConfigurationRequired
          services={missingServices}
          title="The customer account needs configuration"
          description="Protected account and subscription data remain unavailable until Clerk and Convex are both configured. Astreex is not showing sample customer data in their place."
        />
      </main>
    )
  }

  const session = await auth()

  if (!session.userId) {
    redirect(`/sign-in?redirect_url=${encodeURIComponent(destination)}`)
  }

  return <ProductRuntime>{children}</ProductRuntime>
}
