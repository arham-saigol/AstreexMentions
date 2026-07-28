import { clerkMiddleware } from "@clerk/nextjs/server"
import type { NextFetchEvent, NextRequest } from "next/server"
import { NextResponse } from "next/server"

import {
  getAdminAuthConfigurationIssues,
  hasExactAdminClerkUserId,
  readAdminServerEnv,
} from "@/lib/env"

function denyConfiguration(request: NextRequest): NextResponse {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      { allowed: false, reason: "configuration" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    )
  }

  return NextResponse.redirect(new URL("/configuration", request.url))
}

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  const env = readAdminServerEnv()
  const issues = getAdminAuthConfigurationIssues(env)
  const pathname = request.nextUrl.pathname

  if (
    issues.length > 0 ||
    !env.adminClerkUserId ||
    !env.clerkPublishableKey ||
    !env.clerkSecretKey
  ) {
    return pathname === "/configuration"
      ? NextResponse.next()
      : denyConfiguration(request)
  }

  try {
    const authenticate = clerkMiddleware(
      async (getAuth) => {
        const clerkAuth = await getAuth()

        if (pathname === "/configuration") {
          return NextResponse.redirect(new URL("/", request.url))
        }

        if (pathname.startsWith("/sign-in")) {
          if (!clerkAuth.userId) {
            return NextResponse.next()
          }

          return NextResponse.redirect(
            new URL(
              hasExactAdminClerkUserId(clerkAuth.userId, env.adminClerkUserId)
                ? "/metrics"
                : "/unauthorized",
              request.url,
            ),
          )
        }

        if (pathname === "/unauthorized") {
          if (
            hasExactAdminClerkUserId(clerkAuth.userId, env.adminClerkUserId)
          ) {
            return NextResponse.redirect(new URL("/metrics", request.url))
          }

          return NextResponse.next()
        }

        if (!clerkAuth.userId) {
          if (pathname.startsWith("/api/")) {
            return NextResponse.json(
              { allowed: false, reason: "signed-out" },
              { status: 401, headers: { "Cache-Control": "no-store" } },
            )
          }

          const signInUrl = new URL("/sign-in", request.url)
          signInUrl.searchParams.set(
            "redirect_url",
            `${request.nextUrl.pathname}${request.nextUrl.search}`,
          )
          return NextResponse.redirect(signInUrl)
        }

        if (!hasExactAdminClerkUserId(clerkAuth.userId, env.adminClerkUserId)) {
          if (pathname.startsWith("/api/")) {
            return NextResponse.json(
              { allowed: false, reason: "unauthorized" },
              { status: 403, headers: { "Cache-Control": "no-store" } },
            )
          }

          return NextResponse.redirect(new URL("/unauthorized", request.url))
        }

        return NextResponse.next()
      },
      {
        publishableKey: env.clerkPublishableKey,
        secretKey: env.clerkSecretKey,
      },
    )

    return await authenticate(request, event)
  } catch {
    return pathname === "/configuration"
      ? NextResponse.next()
      : denyConfiguration(request)
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|woff2?)$).*)",
    "/(api|trpc)(.*)",
  ],
}
