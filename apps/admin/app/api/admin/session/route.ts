import { NextResponse } from "next/server"

import { guardAdmin } from "@/lib/admin-auth"

export const dynamic = "force-dynamic"

export async function GET() {
  const access = await guardAdmin()

  if (!access.allowed) {
    const status =
      access.kind === "signed-out"
        ? 401
        : access.kind === "unauthorized"
          ? 403
          : 503

    return NextResponse.json(
      { allowed: false, reason: access.kind },
      {
        status,
        headers: { "Cache-Control": "no-store" },
      },
    )
  }

  return NextResponse.json(
    { allowed: true },
    { headers: { "Cache-Control": "no-store" } },
  )
}
