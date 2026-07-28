import type { z } from "zod"

import {
  ProviderAdapterError,
  type ProviderAdapterName,
  type ProviderLogger,
} from "./types"

export const DEFAULT_PROVIDER_TIMEOUT_MS = 15_000

export type ProviderHttpDependencies = {
  fetch?: typeof fetch | undefined
  logger?: ProviderLogger | undefined
  now?: (() => number) | undefined
  timeoutMs?: number | undefined
}

export function parseRetryAfterMs(
  value: string | null,
  now = Date.now(),
): number | undefined {
  if (value === null) {
    return undefined
  }

  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return undefined
  }

  const seconds = Number(trimmed)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.ceil(seconds * 1_000)
  }

  const retryAt = Date.parse(trimmed)
  if (!Number.isFinite(retryAt)) {
    return undefined
  }
  return Math.max(0, retryAt - now)
}

export function requirePositiveTimeout(timeoutMs: number | undefined): number {
  const resolved = timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS
  if (!Number.isFinite(resolved) || resolved <= 0) {
    throw new RangeError("timeoutMs must be positive")
  }
  return resolved
}

export function parseProviderInput<Schema extends z.ZodType>(
  schema: Schema,
  input: unknown,
  provider: ProviderAdapterName,
): z.output<Schema> {
  const result = schema.safeParse(input)
  if (!result.success) {
    throw new ProviderAdapterError(
      provider,
      "invalid_query",
      "Provider search input is invalid",
      { cause: result.error, retryable: false },
    )
  }
  return result.data
}

export function parseProviderResponse<Schema extends z.ZodType>(
  schema: Schema,
  payload: unknown,
  provider: ProviderAdapterName,
): z.output<Schema> {
  const result = schema.safeParse(payload)
  if (!result.success) {
    throw new ProviderAdapterError(
      provider,
      "malformed",
      "Provider returned a malformed response",
      { cause: result.error, retryable: true },
    )
  }
  return result.data
}

export function malformedProviderResponse(
  provider: ProviderAdapterName,
  message = "Provider returned a malformed response",
  cause?: unknown,
): ProviderAdapterError {
  return new ProviderAdapterError(provider, "malformed", message, {
    ...(cause === undefined ? {} : { cause }),
    retryable: true,
  })
}

function errorForHttpStatus(
  provider: ProviderAdapterName,
  response: Response,
  now: number,
): ProviderAdapterError {
  const status = response.status
  if (status === 401 || status === 402 || status === 403) {
    return new ProviderAdapterError(
      provider,
      "auth",
      "Provider authentication failed",
      { retryable: false, status },
    )
  }
  if (status === 429) {
    const retryAfterMs = parseRetryAfterMs(
      response.headers.get("retry-after"),
      now,
    )
    return new ProviderAdapterError(
      provider,
      "rate_limit",
      "Provider rate limit exceeded",
      {
        retryable: true,
        ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
        status,
      },
    )
  }
  if (status === 400 || status === 404 || status === 409 || status === 422) {
    return new ProviderAdapterError(
      provider,
      "invalid_query",
      "Provider rejected the search query",
      { retryable: false, status },
    )
  }
  if (status === 408) {
    return new ProviderAdapterError(
      provider,
      "network",
      "Provider request timed out",
      { retryable: true, status, timedOut: true },
    )
  }
  return new ProviderAdapterError(
    provider,
    "server",
    "Provider returned a server error",
    { retryable: status >= 500, status },
  )
}

function emitProviderLog(
  logger: ProviderLogger | undefined,
  event: Parameters<ProviderLogger>[0],
): void {
  try {
    logger?.(event)
  } catch {
    // Provider behavior must not depend on observability transport availability.
  }
}

export async function runProviderOperation<T>(options: {
  logger?: ProviderLogger | undefined
  now?: (() => number) | undefined
  operation: string
  provider: ProviderAdapterName
  run: () => Promise<T>
  successItemCount: (result: T) => number
}): Promise<T> {
  const now = options.now ?? Date.now
  const startedAt = now()

  try {
    const result = await options.run()
    emitProviderLog(options.logger, {
      durationMs: Math.max(0, now() - startedAt),
      event: "provider_request_completed",
      itemCount: options.successItemCount(result),
      operation: options.operation,
      outcome: "success",
      provider: options.provider,
    })
    return result
  } catch (error) {
    const typedError =
      error instanceof ProviderAdapterError
        ? error
        : new ProviderAdapterError(
            options.provider,
            "network",
            "Provider request failed",
            { cause: error, retryable: true },
          )
    emitProviderLog(options.logger, {
      durationMs: Math.max(0, now() - startedAt),
      errorCode: typedError.code,
      event: "provider_request_failed",
      operation: options.operation,
      outcome: "failure",
      provider: options.provider,
      ...(typedError.status === undefined ? {} : { status: typedError.status }),
    })
    throw typedError
  }
}

export async function requestProviderJson(options: {
  fetch?: typeof fetch | undefined
  init: RequestInit
  now?: (() => number) | undefined
  provider: ProviderAdapterName
  timeoutMs?: number | undefined
  url: string
}): Promise<unknown> {
  const fetchImplementation = options.fetch ?? fetch
  const timeoutMs = requirePositiveTimeout(options.timeoutMs)
  const timeoutController = new AbortController()
  const callerSignal = options.init.signal
  let timedOut = false
  const abortForTimeout = () => {
    timedOut = true
    timeoutController.abort()
  }
  const timeout = setTimeout(abortForTimeout, timeoutMs)
  const abortForCaller = () => timeoutController.abort()
  callerSignal?.addEventListener("abort", abortForCaller, { once: true })
  if (callerSignal?.aborted) {
    abortForCaller()
  }

  try {
    const response = await fetchImplementation(options.url, {
      ...options.init,
      signal: timeoutController.signal,
    })

    if (!response.ok) {
      throw errorForHttpStatus(
        options.provider,
        response,
        (options.now ?? Date.now)(),
      )
    }

    const responseText = await response.text()
    try {
      return JSON.parse(responseText) as unknown
    } catch (error) {
      throw malformedProviderResponse(
        options.provider,
        "Provider returned invalid JSON",
        error,
      )
    }
  } catch (error) {
    if (error instanceof ProviderAdapterError) {
      throw error
    }
    throw new ProviderAdapterError(
      options.provider,
      "network",
      timedOut ? "Provider request timed out" : "Provider request failed",
      { cause: error, retryable: true, timedOut },
    )
  } finally {
    clearTimeout(timeout)
    callerSignal?.removeEventListener("abort", abortForCaller)
  }
}
