import { clerkMiddleware } from "@clerk/nextjs/server"
import {
  NextResponse,
  type NextFetchEvent,
  type NextMiddleware,
  type NextRequest,
} from "next/server"

import { getRuntimeConfiguration } from "@/lib/env"

const protectedRoutePrefixes = [
  "/app",
  "/onboarding",
  "/settings",
  "/api/private",
  "/api/account",
] as const

export function isProtectedRoute(pathname: string): boolean {
  return protectedRoutePrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}

const configuration = getRuntimeConfiguration()

const configuredClerkProxy: NextMiddleware | null = configuration.clerk
  .configured
  ? clerkMiddleware(async (auth, request) => {
      if (isProtectedRoute(request.nextUrl.pathname)) {
        await auth.protect()
      }
    })
  : null

export default async function proxy(
  request: NextRequest,
  event: NextFetchEvent,
) {
  if (!configuredClerkProxy) {
    if (
      request.nextUrl.pathname.startsWith("/api/private") ||
      request.nextUrl.pathname.startsWith("/api/account")
    ) {
      return NextResponse.json(
        { allowed: false, reason: "configuration" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      )
    }

    return NextResponse.next()
  }

  const response = await configuredClerkProxy(request, event)
  return response ?? NextResponse.next()
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|xml|woff2?)$).*)",
  ],
}
