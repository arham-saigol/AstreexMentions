import type { ReactNode } from "react"

import { AccessState } from "@/components/access-state"
import { AdminShell } from "@/components/admin-shell"
import { guardAdmin } from "@/lib/admin-auth"

export const dynamic = "force-dynamic"

export default async function ProtectedAdminLayout({
  children,
}: {
  children: ReactNode
}) {
  const access = await guardAdmin()

  if (!access.allowed) {
    return <AccessState {...access} />
  }

  return <AdminShell>{children}</AdminShell>
}
