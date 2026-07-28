import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { deleteCurrentAccount } from "@/lib/account-deletion"

const requestSchema = z.object({
  confirmation: z.literal("DELETE"),
})

export const dynamic = "force-dynamic"

function configuredApplicationOrigin(): string | null {
  const configured =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (!configured) {
    return null
  }
  try {
    const url = new URL(configured)
    const local =
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1")
    return url.protocol === "https:" || local ? url.origin : null
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  const expectedOrigin = configuredApplicationOrigin()
  if (!expectedOrigin) {
    return NextResponse.json(
      {
        code: "ORIGIN_CONFIGURATION_REQUIRED",
        deleted: false,
        message: "The canonical application origin is not configured.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    )
  }

  const origin = request.headers.get("origin")
  let normalizedOrigin: string | null = null
  try {
    normalizedOrigin = origin ? new URL(origin).origin : null
  } catch {
    normalizedOrigin = null
  }
  if (normalizedOrigin !== expectedOrigin) {
    return NextResponse.json(
      {
        code: "ORIGIN_REJECTED",
        deleted: false,
        message:
          "Account deletion requires the configured same-origin request.",
      },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    )
  }

  const body: unknown = await request.json().catch(() => null)
  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      {
        code: "INVALID_CONFIRMATION",
        deleted: false,
        message: "Type DELETE to confirm account deletion.",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    )
  }

  const result = await deleteCurrentAccount(parsed.data.confirmation)
  const { status, ...response } = result

  return NextResponse.json(response, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}
