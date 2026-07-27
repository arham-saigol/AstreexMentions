import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { AccessState } from "@/components/access-state"
import { guardAdmin } from "@/lib/admin-auth"

export const metadata: Metadata = {
  title: "Configuration required",
}

export const dynamic = "force-dynamic"

export default async function ConfigurationPage() {
  const access = await guardAdmin()

  if (access.allowed || access.kind !== "configuration") {
    redirect("/")
  }

  return (
    <main>
      <AccessState {...access} />
    </main>
  )
}
