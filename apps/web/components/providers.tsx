"use client"

import { ClerkProvider, useAuth } from "@clerk/nextjs"
import { ThemeProvider } from "@astreex/ui/components/theme-provider"
import { ConvexReactClient, ConvexProvider } from "convex/react"
import { ConvexProviderWithClerk } from "convex/react-clerk"
import { useMemo, type ReactNode } from "react"

type ProvidersProps = {
  children: ReactNode
  clerkPublishableKey: string | null
  convexUrl: string | null
}

function ConfiguredConvexProvider({
  children,
  clerkEnabled,
  url,
}: {
  children: ReactNode
  clerkEnabled: boolean
  url: string
}) {
  const client = useMemo(() => new ConvexReactClient(url), [url])

  if (clerkEnabled) {
    return (
      <ConvexProviderWithClerk client={client} useAuth={useAuth}>
        {children}
      </ConvexProviderWithClerk>
    )
  }

  return <ConvexProvider client={client}>{children}</ConvexProvider>
}

export function Providers({
  children,
  clerkPublishableKey,
  convexUrl,
}: ProvidersProps) {
  const content = convexUrl ? (
    <ConfiguredConvexProvider
      url={convexUrl}
      clerkEnabled={Boolean(clerkPublishableKey)}
    >
      {children}
    </ConfiguredConvexProvider>
  ) : (
    children
  )

  return (
    <ThemeProvider>
      {clerkPublishableKey ? (
        <ClerkProvider
          publishableKey={clerkPublishableKey}
          signInUrl="/sign-in"
          signUpUrl="/sign-up"
          afterSignOutUrl="/"
        >
          {content}
        </ClerkProvider>
      ) : (
        content
      )}
    </ThemeProvider>
  )
}
