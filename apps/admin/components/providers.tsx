"use client"

import { ClerkProvider, useAuth } from "@clerk/nextjs"
import { ThemeProvider } from "@astreex/ui"
import { ConvexReactClient } from "convex/react"
import { ConvexProviderWithClerk } from "convex/react-clerk"
import { useState, type ReactNode } from "react"

import type { AdminPublicEnv } from "@/lib/env"

type ProvidersProps = AdminPublicEnv & {
  children: ReactNode
}

function ConvexProvider({
  children,
  convexUrl,
}: {
  children: ReactNode
  convexUrl: string
}) {
  const [client] = useState(() => new ConvexReactClient(convexUrl))

  return (
    <ConvexProviderWithClerk client={client} useAuth={useAuth}>
      {children}
    </ConvexProviderWithClerk>
  )
}

function ConfiguredClerkProvider({
  children,
  clerkPublishableKey,
  convexUrl,
}: {
  children: ReactNode
  clerkPublishableKey: string
  convexUrl: string | undefined
}) {
  return (
    <ClerkProvider
      publishableKey={clerkPublishableKey}
      signInUrl="/sign-in"
      afterSignOutUrl="/sign-in"
    >
      {convexUrl ? (
        <ConvexProvider convexUrl={convexUrl}>{children}</ConvexProvider>
      ) : (
        children
      )}
    </ClerkProvider>
  )
}

export function Providers({
  children,
  clerkPublishableKey,
  convexUrl,
}: ProvidersProps) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      {clerkPublishableKey ? (
        <ConfiguredClerkProvider
          clerkPublishableKey={clerkPublishableKey}
          convexUrl={convexUrl}
        >
          {children}
        </ConfiguredClerkProvider>
      ) : (
        children
      )}
    </ThemeProvider>
  )
}
