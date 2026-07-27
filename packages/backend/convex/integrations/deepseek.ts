import { z } from "zod"

import {
  DEEPSEEK_CATEGORIZATION_MODEL,
  DeepSeekRequestError,
  type DeepSeekCategorizationRequest,
  type DeepSeekRequester,
} from "../lib/deepseekCategorization"

export const DEEPSEEK_CHAT_COMPLETIONS_URL =
  "https://api.deepseek.com/chat/completions"
export const DEFAULT_DEEPSEEK_TIMEOUT_MS = 30_000

const nonEmptyStringSchema = z.string().trim().min(1)
const systemMessageSchema = z
  .object({ content: nonEmptyStringSchema, role: z.literal("system") })
  .strict()
const userMessageSchema = z
  .object({ content: nonEmptyStringSchema, role: z.literal("user") })
  .strict()

export const deepSeekCategorizationRequestSchema = z
  .object({
    messages: z.tuple([systemMessageSchema, userMessageSchema]),
    model: z.literal(DEEPSEEK_CATEGORIZATION_MODEL),
    reasoning_effort: z.literal("high"),
    response_format: z.object({ type: z.literal("json_object") }).strict(),
    temperature: z.literal(0),
    thinking: z.object({ type: z.literal("enabled") }).strict(),
  })
  .strict()

const deepSeekChatCompletionResponseSchema = z
  .object({
    choices: z
      .array(
        z
          .object({
            message: z.object({ content: nonEmptyStringSchema }).passthrough(),
          })
          .passthrough(),
      )
      .min(1),
  })
  .passthrough()

const deepSeekClientOptionsSchema = z
  .object({
    apiKey: nonEmptyStringSchema,
    timeoutMs: z.number().finite().positive(),
  })
  .strict()

export type DeepSeekErrorCode =
  | "AUTH"
  | "INVALID_CONFIGURATION"
  | "INVALID_REQUEST"
  | "INVALID_RESPONSE"
  | "RATE_LIMIT"
  | "REQUEST_FAILED"
  | "REQUEST_TIMEOUT"
  | "SERVER_ERROR"

export class DeepSeekIntegrationError extends DeepSeekRequestError {
  readonly code: DeepSeekErrorCode
  readonly retryAfterMs?: number
  readonly timedOut: boolean

  constructor(
    code: DeepSeekErrorCode,
    message: string,
    options: {
      cause?: unknown
      retryable: boolean
      retryAfterMs?: number
      status?: number
      timedOut?: boolean
    },
  ) {
    super(message, options)
    this.name = "DeepSeekIntegrationError"
    this.code = code
    this.timedOut = options.timedOut ?? false
    if (options.retryAfterMs !== undefined) {
      this.retryAfterMs = options.retryAfterMs
    }
  }
}

export type DeepSeekLogEvent = Readonly<{
  durationMs: number
  errorCode?: DeepSeekErrorCode | undefined
  event: "provider_request_completed" | "provider_request_failed"
  operation: "chat.completions"
  outcome: "failure" | "success"
  provider: "deepseek"
  status?: number | undefined
}>

/** Receives a fixed, secret-free shape: never headers, prompts, bodies, or keys. */
export type DeepSeekLogger = (event: DeepSeekLogEvent) => void

export type DeepSeekProviderUnconfigured = {
  invalid?: readonly ["DEEPSEEK_TIMEOUT_MS"]
  missing?: readonly ["DEEPSEEK_API_KEY"]
  provider: "deepseek"
  state: "provider_unconfigured"
}

export type DeepSeekRuntimeConfiguration =
  | DeepSeekProviderUnconfigured
  | {
      apiKey: string
      provider: "deepseek"
      state: "configured"
      timeoutMs: number
    }

function emitLog(
  logger: DeepSeekLogger | undefined,
  event: DeepSeekLogEvent,
): void {
  try {
    logger?.(event)
  } catch {
    // Provider behavior must not depend on observability transport availability.
  }
}

function parseTimeout(value: string | undefined): number | undefined {
  if (value === undefined || value.trim().length === 0) {
    return DEFAULT_DEEPSEEK_TIMEOUT_MS
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

export function readDeepSeekRuntimeConfiguration(
  source: Readonly<Record<string, string | undefined>>,
): DeepSeekRuntimeConfiguration {
  const apiKey = source.DEEPSEEK_API_KEY?.trim()
  const timeoutMs = parseTimeout(source.DEEPSEEK_TIMEOUT_MS)
  if (!apiKey || timeoutMs === undefined) {
    return {
      ...(!apiKey ? { missing: ["DEEPSEEK_API_KEY"] as const } : {}),
      ...(timeoutMs === undefined
        ? { invalid: ["DEEPSEEK_TIMEOUT_MS"] as const }
        : {}),
      provider: "deepseek",
      state: "provider_unconfigured",
    }
  }

  return {
    apiKey,
    provider: "deepseek",
    state: "configured",
    timeoutMs,
  }
}

function retryAfterMs(value: string | null, now: number): number | undefined {
  if (value === null || value.trim().length === 0) {
    return undefined
  }
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.ceil(seconds * 1_000)
  }
  const retryAt = Date.parse(value)
  return Number.isFinite(retryAt) ? Math.max(0, retryAt - now) : undefined
}

function responseError(
  response: Response,
  now: number,
): DeepSeekIntegrationError {
  const status = response.status
  if (status === 401 || status === 403) {
    return new DeepSeekIntegrationError(
      "AUTH",
      "DeepSeek authentication failed",
      { retryable: false, status },
    )
  }
  if (status === 429) {
    const retryAfter = retryAfterMs(response.headers.get("retry-after"), now)
    return new DeepSeekIntegrationError(
      "RATE_LIMIT",
      "DeepSeek rate limit exceeded",
      {
        retryable: true,
        ...(retryAfter === undefined ? {} : { retryAfterMs: retryAfter }),
        status,
      },
    )
  }
  if (status === 408) {
    return new DeepSeekIntegrationError(
      "REQUEST_TIMEOUT",
      "DeepSeek request timed out",
      { retryable: true, status, timedOut: true },
    )
  }
  if (status === 400 || status === 404 || status === 409 || status === 422) {
    return new DeepSeekIntegrationError(
      "INVALID_REQUEST",
      "DeepSeek rejected the categorization request",
      { retryable: false, status },
    )
  }
  return new DeepSeekIntegrationError(
    "SERVER_ERROR",
    "DeepSeek returned a server error",
    { retryable: status >= 500, status },
  )
}

function outboundRequest(
  request: DeepSeekCategorizationRequest,
): z.output<typeof deepSeekCategorizationRequestSchema> {
  const parsed = deepSeekCategorizationRequestSchema.safeParse({
    ...request,
    reasoning_effort: "high",
    thinking: { type: "enabled" },
  })
  if (!parsed.success) {
    throw new DeepSeekIntegrationError(
      "INVALID_REQUEST",
      "DeepSeek categorization request is invalid",
      { cause: parsed.error, retryable: false },
    )
  }
  return parsed.data
}

export function createDeepSeekCategorizationRequester(options: {
  apiKey: string
  fetch?: typeof fetch | undefined
  logger?: DeepSeekLogger | undefined
  now?: (() => number) | undefined
  timeoutMs?: number | undefined
}): DeepSeekRequester {
  const parsedOptions = deepSeekClientOptionsSchema.safeParse({
    apiKey: options.apiKey,
    timeoutMs: options.timeoutMs ?? DEFAULT_DEEPSEEK_TIMEOUT_MS,
  })
  if (!parsedOptions.success) {
    throw new DeepSeekIntegrationError(
      "INVALID_CONFIGURATION",
      "DeepSeek client configuration is invalid",
      { cause: parsedOptions.error, retryable: false },
    )
  }

  const fetchImplementation = options.fetch ?? fetch
  const now = options.now ?? Date.now

  return async (request, callerSignal) => {
    const body = outboundRequest(request)
    const startedAt = now()
    const controller = new AbortController()
    let timedOut = false
    const abortForTimeout = () => {
      timedOut = true
      controller.abort()
    }
    const timeout = setTimeout(abortForTimeout, parsedOptions.data.timeoutMs)
    const abortForCaller = () => controller.abort()
    callerSignal.addEventListener("abort", abortForCaller, { once: true })
    if (callerSignal.aborted) {
      abortForCaller()
    }

    try {
      const response = await fetchImplementation(
        DEEPSEEK_CHAT_COMPLETIONS_URL,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${parsedOptions.data.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        },
      )
      if (!response.ok) {
        throw responseError(response, now())
      }

      let payload: unknown
      try {
        payload = JSON.parse(await response.text()) as unknown
      } catch (error) {
        throw new DeepSeekIntegrationError(
          "INVALID_RESPONSE",
          "DeepSeek returned invalid JSON",
          { cause: error, retryable: true },
        )
      }
      const parsedResponse =
        deepSeekChatCompletionResponseSchema.safeParse(payload)
      if (!parsedResponse.success) {
        throw new DeepSeekIntegrationError(
          "INVALID_RESPONSE",
          "DeepSeek returned an invalid chat completion",
          { cause: parsedResponse.error, retryable: true },
        )
      }

      emitLog(options.logger, {
        durationMs: Math.max(0, now() - startedAt),
        event: "provider_request_completed",
        operation: "chat.completions",
        outcome: "success",
        provider: "deepseek",
      })
      return parsedResponse.data.choices[0]!.message.content
    } catch (error) {
      const typedError =
        error instanceof DeepSeekIntegrationError
          ? error
          : new DeepSeekIntegrationError(
              timedOut ? "REQUEST_TIMEOUT" : "REQUEST_FAILED",
              timedOut
                ? "DeepSeek request timed out"
                : "DeepSeek request failed",
              { cause: error, retryable: true, timedOut },
            )
      emitLog(options.logger, {
        durationMs: Math.max(0, now() - startedAt),
        errorCode: typedError.code,
        event: "provider_request_failed",
        operation: "chat.completions",
        outcome: "failure",
        provider: "deepseek",
        ...(typedError.status === undefined
          ? {}
          : { status: typedError.status }),
      })
      throw typedError
    } finally {
      clearTimeout(timeout)
      callerSignal.removeEventListener("abort", abortForCaller)
    }
  }
}
