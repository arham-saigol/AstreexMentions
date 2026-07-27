import { SignOutButton } from "@clerk/nextjs"
import { Button } from "@astreex/ui/components/button"
import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { AccessState } from "@/components/access-state"
import { guardAdmin } from "@/lib/admin-auth"

export const metadata: Metadata = {
  title: "Unauthorized",
}

export const dynamic = "force-dynamic"

export default async function UnauthorizedPage() {
  const access = await guardAdmin()

  if (access.allowed) {
    redirect("/metrics")
  }

  if (access.kind === "configuration") {
    redirect("/configuration")
  }

  if (access.kind === "signed-out") {
    redirect("/sign-in")
  }

  return (
    <main>
      <AccessState kind="unauthorized" />
      <div className="mx-auto -mt-36 flex w-full max-w-2xl justify-center px-4 pb-12 sm:px-6">
        <SignOutButton redirectUrl="/sign-in">
          <Button variant="outline">Sign out and use another account</Button>
        </SignOutButton>
      </div>
    </main>
  )
}
