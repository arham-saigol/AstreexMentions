import { GoogleGenAI, ThinkingLevel } from "@google/genai"
import { z } from "zod"

export const GEMINI_MODEL = "gemini-3.5-flash-lite"
export const DEFAULT_VERTEX_AI_LOCATION = "global"
export const DEFAULT_VERTEX_AI_TIMEOUT_MS = 120_000
export const MAX_GEMINI_GENERATION_CONTENT_CHARS = 48_000

const nonEmptyStringSchema = z.string().trim().min(1)
const serviceAccountPrivateKeySchema = nonEmptyStringSchema.refine(
  (value) =>
    value.includes("-----BEGIN PRIVATE KEY-----") &&
    value.includes("-----END PRIVATE KEY-----"),
)
const serviceAccountSchema = z
  .object({
    client_email: nonEmptyStringSchema,
    private_key: serviceAccountPrivateKeySchema,
    project_id: nonEmptyStringSchema,
    type: z.literal("service_account"),
  })
  .passthrough()

type GeminiConfigurationInvalidName =
  | "VERTEX_AI_LOCATION"
  | "VERTEX_AI_SERVICE_ACCOUNT_JSON"
  | "VERTEX_AI_TIMEOUT_MS"
type GeminiConfigurationMissingName =
  "VERTEX_AI_PROJECT_ID" | "VERTEX_AI_SERVICE_ACCOUNT_JSON"

export type GeminiProviderUnconfigured = {
  invalid?: readonly GeminiConfigurationInvalidName[]
  missing?: readonly GeminiConfigurationMissingName[]
  provider: "gemini"
  state: "provider_unconfigured"
}

export type GeminiRuntimeConfiguration =
  | GeminiProviderUnconfigured
  | {
      credentials: z.output<typeof serviceAccountSchema>
      location: string
      projectId: string
      provider: "gemini"
      state: "configured"
      timeoutMs: number
    }

export type GeminiErrorCode =
  | "AUTH"
  | "INVALID_CONFIGURATION"
  | "INVALID_REQUEST"
  | "INVALID_RESPONSE"
  | "RATE_LIMIT"
  | "REQUEST_FAILED"
  | "REQUEST_TIMEOUT"
  | "SERVER_ERROR"

export class GeminiIntegrationError extends Error {
  readonly code: GeminiErrorCode
  readonly retryAfterMs?: number
  readonly retryable: boolean
  readonly status?: number
  readonly timedOut: boolean

  constructor(
    code: GeminiErrorCode,
    message: string,
    options: {
      cause?: unknown
      retryAfterMs?: number
      retryable: boolean
      status?: number
      timedOut?: boolean
    },
  ) {
    super(
      message,
      options.cause === undefined ? undefined : { cause: options.cause },
    )
    this.name = "GeminiIntegrationError"
    this.code = code
    this.retryable = options.retryable
    this.timedOut = options.timedOut ?? false
    if (options.retryAfterMs !== undefined) {
      this.retryAfterMs = options.retryAfterMs
    }
    if (options.status !== undefined) {
      this.status = options.status
    }
  }
}

export type GeminiLogEvent = Readonly<{
  durationMs: number
  errorCode?: GeminiErrorCode | undefined
  event: "provider_request_completed" | "provider_request_failed"
  operation: "generate_content"
  outcome: "failure" | "success"
  provider: "gemini"
  status?: number | undefined
}>

/** Receives a fixed, secret-free shape: never credentials, prompts, or bodies. */
export type GeminiLogger = (event: GeminiLogEvent) => void

export type GeminiJsonGenerationRequest = Readonly<{
  responseJsonSchema: Record<string, unknown>
  systemInstruction: string
  userContent: string
}>

export type GeminiJsonRequester = (
  request: GeminiJsonGenerationRequest,
  signal: AbortSignal,
) => Promise<unknown>

type GeminiClient = {
  models: {
    generateContent: (request: {
      config: {
        abortSignal: AbortSignal
        httpOptions: { timeout: number }
        responseJsonSchema: Record<string, unknown>
        responseMimeType: "application/json"
        systemInstruction: string
        thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM }
      }
      contents: string
      model: typeof GEMINI_MODEL
    }) => Promise<{ text?: string | undefined }>
  }
}

function parseTimeout(value: string | undefined): number | undefined {
  if (value === undefined || value.trim().length === 0) {
    return DEFAULT_VERTEX_AI_TIMEOUT_MS
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function parseCredentials(value: string | undefined) {
  if (value === undefined || value.trim().length === 0) {
    return undefined
  }
  try {
    const result = serviceAccountSchema.safeParse(JSON.parse(value) as unknown)
    return result.success ? result.data : undefined
  } catch {
    return undefined
  }
}

export function readGeminiRuntimeConfiguration(
  source: Readonly<Record<string, string | undefined>>,
): GeminiRuntimeConfiguration {
  const projectId = source.VERTEX_AI_PROJECT_ID?.trim()
  const location =
    source.VERTEX_AI_LOCATION === undefined ||
    source.VERTEX_AI_LOCATION.trim().length === 0
      ? DEFAULT_VERTEX_AI_LOCATION
      : source.VERTEX_AI_LOCATION.trim()
  const timeoutMs = parseTimeout(source.VERTEX_AI_TIMEOUT_MS)
  const credentials = parseCredentials(source.VERTEX_AI_SERVICE_ACCOUNT_JSON)
  const missing: GeminiConfigurationMissingName[] = []
  if (!projectId) missing.push("VERTEX_AI_PROJECT_ID")
  if (
    source.VERTEX_AI_SERVICE_ACCOUNT_JSON === undefined ||
    source.VERTEX_AI_SERVICE_ACCOUNT_JSON.trim().length === 0
  ) {
    missing.push("VERTEX_AI_SERVICE_ACCOUNT_JSON")
  }
  const invalid: GeminiConfigurationInvalidName[] = []
  if (location !== DEFAULT_VERTEX_AI_LOCATION) {
    invalid.push("VERTEX_AI_LOCATION")
  }
  if (timeoutMs === undefined) invalid.push("VERTEX_AI_TIMEOUT_MS")
  if (
    source.VERTEX_AI_SERVICE_ACCOUNT_JSON !== undefined &&
    source.VERTEX_AI_SERVICE_ACCOUNT_JSON.trim().length > 0 &&
    !credentials
  ) {
    invalid.push("VERTEX_AI_SERVICE_ACCOUNT_JSON")
  }
  if (
    missing.length > 0 ||
    invalid.length > 0 ||
    !projectId ||
    !credentials ||
    timeoutMs === undefined
  ) {
    return {
      ...(invalid.length > 0 ? { invalid } : {}),
      ...(missing.length > 0 ? { missing } : {}),
      provider: "gemini",
      state: "provider_unconfigured",
    }
  }

  return {
    credentials,
    location,
    projectId,
    provider: "gemini",
    state: "configured",
    timeoutMs,
  }
}

function emitLog(
  logger: GeminiLogger | undefined,
  event: GeminiLogEvent,
): void {
  try {
    logger?.(event)
  } catch {
    // Provider behavior must not depend on observability transport availability.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function integerStatus(error: unknown): number | undefined {
  if (!isRecord(error)) return undefined
  for (const field of ["status", "statusCode"]) {
    const value = error[field]
    if (typeof value === "number" && Number.isInteger(value)) return value
  }
  const response = error.response
  return isRecord(response) &&
    typeof response.status === "number" &&
    Number.isInteger(response.status)
    ? response.status
    : undefined
}

function headersFor(error: unknown): Headers | undefined {
  if (!isRecord(error)) return undefined
  const headers = error.headers
  return headers instanceof Headers ? headers : undefined
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

function requestError(
  error: unknown,
  timedOut: boolean,
): GeminiIntegrationError {
  if (timedOut) {
    return new GeminiIntegrationError(
      "REQUEST_TIMEOUT",
      "Vertex Gemini request timed out",
      { cause: error, retryable: true, timedOut: true },
    )
  }
  const status = integerStatus(error)
  if (status === 401 || status === 403) {
    return new GeminiIntegrationError(
      "AUTH",
      "Vertex Gemini authentication failed",
      { cause: error, retryable: false, status },
    )
  }
  if (status === 429) {
    const headers = headersFor(error)
    const retryAfter =
      headers?.get("retry-after-ms") !== null &&
      headers?.get("retry-after-ms") !== undefined
        ? Number(headers.get("retry-after-ms"))
        : undefined
    const retryAfterMsValue =
      retryAfter !== undefined && Number.isFinite(retryAfter) && retryAfter >= 0
        ? Math.ceil(retryAfter)
        : retryAfterMs(headers?.get("retry-after") ?? null, Date.now())
    return new GeminiIntegrationError(
      "RATE_LIMIT",
      "Vertex Gemini rate limit exceeded",
      {
        cause: error,
        ...(retryAfterMsValue === undefined
          ? {}
          : { retryAfterMs: retryAfterMsValue }),
        retryable: true,
        status,
      },
    )
  }
  if (status === 408) {
    return new GeminiIntegrationError(
      "REQUEST_TIMEOUT",
      "Vertex Gemini request timed out",
      { cause: error, retryable: true, status, timedOut: true },
    )
  }
  if (status === 400 || status === 404 || status === 409 || status === 422) {
    return new GeminiIntegrationError(
      "INVALID_REQUEST",
      "Vertex Gemini rejected the generation request",
      { cause: error, retryable: false, status },
    )
  }
  if (status !== undefined && status >= 500) {
    return new GeminiIntegrationError(
      "SERVER_ERROR",
      "Vertex Gemini returned a server error",
      { cause: error, retryable: true, status },
    )
  }
  return new GeminiIntegrationError(
    "REQUEST_FAILED",
    "Vertex Gemini request failed",
    {
      cause: error,
      retryable: true,
      ...(status === undefined ? {} : { status }),
    },
  )
}

function validatedRequest(
  request: GeminiJsonGenerationRequest,
): GeminiJsonGenerationRequest {
  if (
    request.systemInstruction.trim().length === 0 ||
    request.userContent.trim().length === 0 ||
    request.systemInstruction.length > MAX_GEMINI_GENERATION_CONTENT_CHARS ||
    request.userContent.length > MAX_GEMINI_GENERATION_CONTENT_CHARS ||
    !isRecord(request.responseJsonSchema)
  ) {
    throw new GeminiIntegrationError(
      "INVALID_REQUEST",
      "Vertex Gemini generation request is invalid",
      { retryable: false },
    )
  }
  return request
}

function defaultClient(
  configuration: Extract<GeminiRuntimeConfiguration, { state: "configured" }>,
): GeminiClient {
  return new GoogleGenAI({
    googleAuthOptions: {
      credentials: {
        client_email: configuration.credentials.client_email,
        private_key: configuration.credentials.private_key,
        project_id: configuration.credentials.project_id,
      },
    },
    location: configuration.location,
    project: configuration.projectId,
    vertexai: true,
  })
}

export function createGeminiJsonRequester(options: {
  client?: GeminiClient | undefined
  configuration: Extract<GeminiRuntimeConfiguration, { state: "configured" }>
  logger?: GeminiLogger | undefined
  now?: (() => number) | undefined
}): GeminiJsonRequester {
  let client: GeminiClient
  try {
    client = options.client ?? defaultClient(options.configuration)
  } catch (error) {
    throw new GeminiIntegrationError(
      "INVALID_CONFIGURATION",
      "Vertex Gemini client configuration is invalid",
      { cause: error, retryable: false },
    )
  }
  const now = options.now ?? Date.now

  return async (request, callerSignal) => {
    const validRequest = validatedRequest(request)
    const startedAt = now()
    const controller = new AbortController()
    let timedOut = false
    const abortForTimeout = () => {
      timedOut = true
      controller.abort()
    }
    const timeout = setTimeout(abortForTimeout, options.configuration.timeoutMs)
    const abortForCaller = () => controller.abort()
    callerSignal.addEventListener("abort", abortForCaller, { once: true })
    if (callerSignal.aborted) {
      abortForCaller()
    }

    try {
      const response = await client.models.generateContent({
        config: {
          abortSignal: controller.signal,
          httpOptions: { timeout: options.configuration.timeoutMs },
          responseJsonSchema: validRequest.responseJsonSchema,
          responseMimeType: "application/json",
          systemInstruction: validRequest.systemInstruction,
          thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
        },
        contents: validRequest.userContent,
        model: GEMINI_MODEL,
      })
      if (
        typeof response.text !== "string" ||
        response.text.trim().length === 0
      ) {
        throw new GeminiIntegrationError(
          "INVALID_RESPONSE",
          "Vertex Gemini returned an empty structured response",
          { retryable: true },
        )
      }
      try {
        const output = JSON.parse(response.text) as unknown
        emitLog(options.logger, {
          durationMs: Math.max(0, now() - startedAt),
          event: "provider_request_completed",
          operation: "generate_content",
          outcome: "success",
          provider: "gemini",
        })
        return output
      } catch (error) {
        throw new GeminiIntegrationError(
          "INVALID_RESPONSE",
          "Vertex Gemini returned invalid structured JSON",
          { cause: error, retryable: true },
        )
      }
    } catch (error) {
      const typedError =
        error instanceof GeminiIntegrationError
          ? error
          : requestError(error, timedOut)
      emitLog(options.logger, {
        durationMs: Math.max(0, now() - startedAt),
        errorCode: typedError.code,
        event: "provider_request_failed",
        operation: "generate_content",
        outcome: "failure",
        provider: "gemini",
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
