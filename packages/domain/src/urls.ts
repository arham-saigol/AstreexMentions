import { platformSchema, type Platform } from "./enums"

const TRACKING_PARAMETER_NAMES = new Set([
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "ref_src",
])

function parseWebUrl(rawUrl: string): URL {
  let url: URL
  try {
    url = new URL(rawUrl.trim())
  } catch (error) {
    throw new TypeError("Mention URL must be an absolute URL", { cause: error })
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError("Mention URL must use HTTP or HTTPS")
  }
  if (url.username || url.password) {
    throw new TypeError("Mention URL cannot contain credentials")
  }
  return url
}

function normalizedHostname(url: URL): string {
  return url.hostname.toLowerCase().replace(/^www\./, "")
}

function isHostOrSubdomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`)
}

function detectPlatform(url: URL): Platform | undefined {
  const hostname = normalizedHostname(url)
  if (
    isHostOrSubdomain(hostname, "x.com") ||
    isHostOrSubdomain(hostname, "twitter.com")
  ) {
    return "x"
  }
  if (isHostOrSubdomain(hostname, "reddit.com") || hostname === "redd.it") {
    return "reddit"
  }
  if (hostname === "news.ycombinator.com") return "hacker_news"
  return undefined
}

export function detectPlatformFromUrl(rawUrl: string): Platform | undefined {
  return detectPlatform(parseWebUrl(rawUrl))
}

function xContentId(url: URL): string | undefined {
  const match = url.pathname.match(
    /^\/(?:i\/web\/status|[^/]+\/status)\/(\d+)(?:\/|$)/i,
  )
  return match?.[1]
}

function redditContentId(url: URL): string | undefined {
  const hostname = normalizedHostname(url)
  if (hostname === "redd.it") {
    return url.pathname.match(/^\/([a-z0-9]+)(?:\/|$)/i)?.[1]?.toLowerCase()
  }
  return url.pathname
    .match(/\/comments\/([a-z0-9]+)(?:\/|$)/i)?.[1]
    ?.toLowerCase()
}

function hackerNewsContentId(url: URL): string | undefined {
  if (url.pathname !== "/item") return undefined
  const id = url.searchParams.get("id")
  return id && /^\d+$/.test(id) ? id : undefined
}

function providerContentId(
  url: URL,
  platform: Platform | undefined,
): string | undefined {
  if (platform === undefined || detectPlatform(url) !== platform) {
    return undefined
  }

  switch (platform) {
    case "x":
      return xContentId(url)
    case "reddit":
      return redditContentId(url)
    case "hacker_news":
      return hackerNewsContentId(url)
  }
}

export function extractProviderContentId(
  rawUrl: string,
  platform?: Platform,
): string | undefined {
  const url = parseWebUrl(rawUrl)
  return providerContentId(url, platform ?? detectPlatform(url))
}

function stripTrackingParameters(url: URL): void {
  for (const name of [...url.searchParams.keys()]) {
    const lowerName = name.toLowerCase()
    if (
      lowerName.startsWith("utm_") ||
      TRACKING_PARAMETER_NAMES.has(lowerName)
    ) {
      url.searchParams.delete(name)
    }
  }
  url.searchParams.sort()
}

function canonicalGenericUrl(url: URL): string {
  const originalPort = url.port
  url.protocol = "https:"
  url.hostname = url.hostname.toLowerCase()
  url.hash = ""
  if (originalPort === "80" || originalPort === "443") {
    url.port = ""
  }
  url.pathname = url.pathname.replace(/\/{2,}/g, "/")
  if (url.pathname.length > 1) {
    url.pathname = url.pathname.replace(/\/+$/, "")
  }
  stripTrackingParameters(url)
  return url.toString()
}

function canonicalizeParsedUrl(url: URL, platform?: Platform): string {
  const resolvedPlatform = platform ?? detectPlatform(url)
  const contentId = providerContentId(url, resolvedPlatform)

  if (resolvedPlatform === "x" && contentId) {
    return `https://x.com/i/web/status/${contentId}`
  }
  if (resolvedPlatform === "reddit" && contentId) {
    const subreddit = url.pathname.match(/^\/r\/([^/]+)\/comments\//i)?.[1]
    return subreddit
      ? `https://www.reddit.com/r/${subreddit.toLowerCase()}/comments/${contentId}`
      : `https://www.reddit.com/comments/${contentId}`
  }
  if (resolvedPlatform === "hacker_news" && contentId) {
    return `https://news.ycombinator.com/item?id=${contentId}`
  }

  return canonicalGenericUrl(url)
}

export function canonicalizeMentionUrl(
  rawUrl: string,
  platform?: Platform,
): string {
  if (platform !== undefined) {
    platformSchema.parse(platform)
  }
  return canonicalizeParsedUrl(parseWebUrl(rawUrl), platform)
}

export const canonicalizeUrl = canonicalizeMentionUrl

export type MentionDedupeInput = {
  platform: Platform
  providerId?: string
  url: string
}

export function createMentionDedupeKey({
  platform,
  providerId,
  url,
}: MentionDedupeInput): string {
  const parsedUrl = parseWebUrl(url)
  const explicitId = providerId?.trim()
  const contentId = explicitId || providerContentId(parsedUrl, platform)
  if (contentId) {
    const normalizedId =
      platform === "reddit" ? contentId.toLowerCase() : contentId
    return `${platform}:${normalizedId}`
  }
  return `${platform}:url:${canonicalizeParsedUrl(parsedUrl, platform)}`
}

export const mentionDedupeKey = createMentionDedupeKey
