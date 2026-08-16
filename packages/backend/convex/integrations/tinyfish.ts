import { z } from "zod"

export const TINYFISH_FETCH_URL = "https://api.fetch.tinyfish.ai"
export const TINYFISH_SEARCH_URL = "https://api.search.tinyfish.ai"
export const MAX_RESEARCH_URL_LENGTH = 2_000
export const MAX_TINYFISH_FETCH_URLS = 10
export const MAX_TINYFISH_PAGE_CHARS = 24_000
export const MAX_TINYFISH_SEARCH_RESULTS = 5
export const DEFAULT_TINYFISH_TIMEOUT_MS = 45_000

const fetchResponseSchema = z
  .object({
    results: z.array(z.object({ text: z.string() }).passthrough()),
  })
  .passthrough()
const searchResultSchema = z
  .object({
    position: z.number().int().nonnegative(),
    site_name: z.string().optional(),
    snippet: z.string(),
    title: z.string(),
    url: z.string().url(),
  })
  .passthrough()
const searchResponseSchema = z
  .object({
    query: z.string(),
    results: z.array(searchResultSchema),
  })
  .passthrough()

export class TinyFishIntegrationError extends Error {
  readonly code: "INVALID_INPUT" | "INVALID_RESPONSE" | "REQUEST_FAILED"
  readonly retryable: boolean
  readonly status?: number

  constructor(
    code: TinyFishIntegrationError["code"],
    message: string,
    options: { cause?: unknown; retryable: boolean; status?: number },
  ) {
    super(
      message,
      options.cause === undefined ? undefined : { cause: options.cause },
    )
    this.name = "TinyFishIntegrationError"
    this.code = code
    this.retryable = options.retryable
    if (options.status !== undefined) this.status = options.status
  }
}

function blockedHostname(hostname: string): boolean {
  const host = hostname.toLocaleLowerCase("en").replace(/^\[|\]$/g, "")
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "metadata.google.internal" ||
    host === "169.254.169.254" ||
    host.startsWith("::")
  ) {
    return true
  }
  const parts = host.split(".").map(Number)
  if (parts.length === 4 && parts.every((part) => Number.isInteger(part))) {
    const [a, b] = parts as [number, number, number, number]
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    )
  }
  const firstHextet = Number.parseInt(host.split(":")[0] ?? "", 16)
  return (
    Number.isInteger(firstHextet) &&
    ((firstHextet & 0xfe00) === 0xfc00 ||
      (firstHextet & 0xffc0) === 0xfe80 ||
      (firstHextet & 0xff00) === 0xff00)
  )
}

export function canonicalResearchUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > MAX_RESEARCH_URL_LENGTH) {
    throw new TinyFishIntegrationError(
      "INVALID_INPUT",
      "Enter a valid company website URL",
      {
        retryable: false,
      },
    )
  }
  const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  let url: URL
  try {
    url = new URL(normalized)
  } catch (cause) {
    throw new TinyFishIntegrationError(
      "INVALID_INPUT",
      "Enter a valid company website URL",
      {
        cause,
        retryable: false,
      },
    )
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    blockedHostname(url.hostname)
  ) {
    throw new TinyFishIntegrationError(
      "INVALID_INPUT",
      "Use a public HTTP(S) website without credentials or a private network address",
      { retryable: false },
    )
  }
  url.hash = ""
  return url.toString()
}

async function requestJson(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  fetchImplementation: typeof fetch,
): Promise<unknown> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs + 5_000)
  try {
    const response = await fetchImplementation(url, {
      ...init,
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new TinyFishIntegrationError(
        "REQUEST_FAILED",
        `TinyFish returned HTTP ${response.status}`,
        {
          retryable: response.status === 429 || response.status >= 500,
          status: response.status,
        },
      )
    }
    return JSON.parse(await response.text()) as unknown
  } catch (error) {
    if (error instanceof TinyFishIntegrationError) throw error
    throw new TinyFishIntegrationError(
      "REQUEST_FAILED",
      "TinyFish request failed",
      {
        cause: error,
        retryable: true,
      },
    )
  } finally {
    clearTimeout(timeout)
  }
}

export function createTinyFishClient(options: {
  apiKey: string
  fetch?: typeof fetch
  timeoutMs?: number
}) {
  const apiKey = options.apiKey.trim()
  if (!apiKey) {
    throw new TinyFishIntegrationError(
      "INVALID_INPUT",
      "TinyFish configuration is invalid",
      {
        retryable: false,
      },
    )
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_TINYFISH_TIMEOUT_MS
  const fetchImplementation = options.fetch ?? fetch
  return {
    async fetchMarkdown(urls: readonly string[], purpose: string) {
      if (urls.length < 1 || urls.length > MAX_TINYFISH_FETCH_URLS) {
        throw new TinyFishIntegrationError(
          "INVALID_INPUT",
          "TinyFish Fetch URL count is invalid",
          {
            retryable: false,
          },
        )
      }
      const canonicalUrls = urls.map(canonicalResearchUrl)
      const payload = await requestJson(
        TINYFISH_FETCH_URL,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
          body: JSON.stringify({
            format: "markdown",
            per_url_timeout_ms: timeoutMs,
            purpose: purpose.slice(0, 2_000),
            urls: canonicalUrls,
          }),
        },
        timeoutMs,
        fetchImplementation,
      )
      const parsed = fetchResponseSchema.safeParse(payload)
      if (!parsed.success) {
        throw new TinyFishIntegrationError(
          "INVALID_RESPONSE",
          "TinyFish Fetch returned malformed data",
          {
            cause: parsed.error,
            retryable: true,
          },
        )
      }
      return parsed.data.results.map((result) =>
        result.text.slice(0, MAX_TINYFISH_PAGE_CHARS),
      )
    },

    async search(query: string, purpose: string) {
      const normalized = query.trim().slice(0, 300)
      if (!normalized) {
        throw new TinyFishIntegrationError(
          "INVALID_INPUT",
          "TinyFish search query is empty",
          {
            retryable: false,
          },
        )
      }
      const url = new URL(TINYFISH_SEARCH_URL)
      url.searchParams.set("query", normalized)
      url.searchParams.set("purpose", purpose.slice(0, 2_000))
      const payload = await requestJson(
        url.toString(),
        { headers: { "X-API-Key": apiKey } },
        timeoutMs,
        fetchImplementation,
      )
      const parsed = searchResponseSchema.safeParse(payload)
      if (!parsed.success) {
        throw new TinyFishIntegrationError(
          "INVALID_RESPONSE",
          "TinyFish Search returned malformed data",
          {
            cause: parsed.error,
            retryable: true,
          },
        )
      }
      return parsed.data.results
        .slice(0, MAX_TINYFISH_SEARCH_RESULTS)
        .map((result) => ({
          ...result,
          snippet: result.snippet.slice(0, 1_000),
          title: result.title.slice(0, 300),
        }))
    },
  }
}
