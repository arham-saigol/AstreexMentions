import { SignIn } from "@clerk/nextjs"
import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { AstreexWordmark } from "@astreex/ui/components/astreex-wordmark"

import { AccessState } from "@/components/access-state"
import { guardAdmin } from "@/lib/admin-auth"

export const metadata: Metadata = {
  title: "Sign in",
}

export const dynamic = "force-dynamic"

export default async function SignInPage() {
  const access = await guardAdmin()

  if (access.allowed) {
    redirect("/metrics")
  }

  if (access.kind === "configuration") {
    return (
      <main>
        <AccessState {...access} />
      </main>
    )
  }

  if (access.kind === "unauthorized") {
    redirect("/unauthorized")
  }

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="flex w-full max-w-md flex-col items-center gap-7">
        <div className="text-center">
          <AstreexWordmark className="justify-center" />
          <p className="text-muted-foreground mt-2 text-sm">
            Restricted administrator sign-in
          </p>
        </div>
        <SignIn
          routing="path"
          path="/sign-in"
          forceRedirectUrl="/metrics"
          appearance={{
            elements: {
              cardBox: "shadow-sm",
              footer: "hidden",
            },
          }}
        />
      </div>
    </main>
  )
}
