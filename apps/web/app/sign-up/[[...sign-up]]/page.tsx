import { SignUp } from "@clerk/nextjs"
import type { Metadata } from "next"

import { AuthConfigurationRequired } from "@/components/auth-configuration-required"
import { AuthFrame } from "@/components/auth-frame"
import { astreexClerkAppearance } from "@/lib/clerk-appearance"
import { getRuntimeConfiguration } from "@/lib/env"

export const metadata: Metadata = {
  title: "Create an account",
  description: "Create an account for a configured Astreex deployment.",
  alternates: { canonical: "/sign-up" },
  robots: { index: false, follow: false },
}

export default function SignUpPage() {
  const configuration = getRuntimeConfiguration()

  if (!configuration.clerk.configured) {
    return (
      <AuthFrame
        eyebrow="Create your account"
        title="Build a customer-signal practice around deliberate scope."
        description="Account creation stays unavailable until the deployment owner connects a valid Clerk instance."
        contentWidth="status"
      >
        <AuthConfigurationRequired
          service={configuration.clerk}
          title="Account creation is not configured"
          description="Astreex cannot show a registration form or create an identity until valid Clerk publishable and server keys are present."
        />
      </AuthFrame>
    )
  }

  return (
    <AuthFrame
      eyebrow="Create your account"
      title="Build a customer-signal practice around deliberate scope."
      description="Use the email or Google registration method enabled by this deployment's Clerk configuration."
    >
      <SignUp
        path="/sign-up"
        routing="path"
        signInUrl="/sign-in"
        fallbackRedirectUrl="/app"
        appearance={astreexClerkAppearance}
      />
    </AuthFrame>
  )
}
