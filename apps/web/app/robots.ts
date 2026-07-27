import type { MetadataRoute } from "next"

import { getSiteUrl } from "@/lib/env"

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl()

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/app$",
        "/app/",
        "/onboarding$",
        "/onboarding/",
        "/settings$",
        "/settings/",
        "/api/private$",
        "/api/private/",
        "/sign-in$",
        "/sign-in/",
        "/sign-up$",
        "/sign-up/",
      ],
    },
    sitemap: new URL("/sitemap.xml", siteUrl).toString(),
    host: siteUrl.origin,
  }
}
