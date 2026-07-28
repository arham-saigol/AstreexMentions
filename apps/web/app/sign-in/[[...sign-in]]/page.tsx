import { SignIn } from "@clerk/nextjs"
import type { Metadata } from "next"

import { AuthConfigurationRequired } from "@/components/auth-configuration-required"
import { AuthFrame } from "@/components/auth-frame"
import { astreexClerkAppearance } from "@/lib/clerk-appearance"
import { getRuntimeConfiguration } from "@/lib/env"

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your Astreex account.",
  alternates: { canonical: "/sign-in" },
  robots: { index: false, follow: false },
}

export default function SignInPage() {
  const configuration = getRuntimeConfiguration()

  if (!configuration.clerk.configured) {
    return (
      <AuthFrame
        eyebrow="Account access"
        title="Return to the conversations you are reviewing."
        description="Authentication stays unavailable until the deployment owner connects a valid Clerk instance."
        contentWidth="status"
      >
        <AuthConfigurationRequired
          service={configuration.clerk}
          title="Sign-in is not configured"
          description="Astreex cannot show an authentication form or begin a session until valid Clerk publishable and server keys are present."
        />
      </AuthFrame>
    )
  }

  return (
    <AuthFrame
      eyebrow="Account access"
      title="Return to the conversations you are reviewing."
      description="Use the email or Google sign-in method enabled by this deployment's Clerk configuration."
    >
      <SignIn
        path="/sign-in"
        routing="path"
        signUpUrl="/sign-up"
        fallbackRedirectUrl="/app"
        appearance={astreexClerkAppearance}
      />
    </AuthFrame>
  )
}
