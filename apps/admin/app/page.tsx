import { redirect } from "next/navigation"

import { AccessState } from "@/components/access-state"
import { guardAdmin } from "@/lib/admin-auth"

export const dynamic = "force-dynamic"

export default async function AdminIndexPage() {
  const access = await guardAdmin()

  if (!access.allowed) {
    return (
      <main>
        <AccessState {...access} />
      </main>
    )
  }

  redirect("/metrics")
}
