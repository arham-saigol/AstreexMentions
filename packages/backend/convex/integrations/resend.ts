import { Resend } from "resend"
import { z } from "zod"

export const RESEND_API_BASE_URL = "https://api.resend.com"
export const DEFAULT_RESEND_TIMEOUT_MS = 15_000

const nonEmptyStringSchema = z.string().trim().min(1)
const resendSendInputSchema = z
  .object({
    from: nonEmptyStringSchema,
    html: nonEmptyStringSchema,
    idempotencyKey: nonEmptyStringSchema.max(256),
    replyTo: nonEmptyStringSchema.optional(),
    subject: nonEmptyStringSchema,
    text: z.string().optional(),
    to: z.array(nonEmptyStringSchema).min(1),
  })
  .strict()

const resendSendResponseSchema = z.object({ id: nonEmptyStringSchema }).strict()

const resendClientConfigurationSchema = z
  .object({
    apiKey: nonEmptyStringSchema,
    baseUrl: z.string().url().default(RESEND_API_BASE_URL),
    timeoutMs: z.number().int().positive().default(DEFAULT_RESEND_TIMEOUT_MS),
  })
  .strict()

export type ResendSendInput = z.input<typeof resendSendInputSchema>

export type ResendClient = {
  sendEmail(input: ResendSendInput): Promise<{ id: string }>
}

export class ResendIntegrationError extends Error {
  readonly code:
    | "INVALID_CONFIGURATION"
    | "INVALID_INPUT"
    | "INVALID_RESPONSE"
    | "PROVIDER_REJECTED"
    | "REQUEST_FAILED"
    | "REQUEST_TIMEOUT"
  readonly retryable: boolean
  readonly status?: number

  constructor(
    code: ResendIntegrationError["code"],
    message: string,
    options: {
      cause?: unknown
      retryable?: boolean
      status?: number
    } = {},
  ) {
    super(
      message,
      options.cause === undefined ? undefined : { cause: options.cause },
    )
    this.name = "ResendIntegrationError"
    this.code = code
    this.retryable = options.retryable ?? false
    if (options.status !== undefined) {
      this.status = options.status
    }
  }
}

function retryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500
}

export function createResendClient(options: {
  apiKey: string
  baseUrl?: string
  fetch?: typeof fetch
  timeoutMs?: number
}): ResendClient {
  const configuration = resendClientConfigurationSchema.safeParse({
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
    timeoutMs: options.timeoutMs,
  })
  if (!configuration.success) {
    throw new ResendIntegrationError(
      "INVALID_CONFIGURATION",
      "Resend client configuration is invalid",
      { cause: configuration.error },
    )
  }
  const fetchImplementation = options.fetch ?? fetch

  return {
    sendEmail: async (input) => {
      const validated = resendSendInputSchema.safeParse(input)
      if (!validated.success) {
        throw new ResendIntegrationError(
          "INVALID_INPUT",
          "Resend email input is invalid",
          { cause: validated.error },
        )
      }

      const controller = new AbortController()
      const timeout = setTimeout(
        () => controller.abort(),
        configuration.data.timeoutMs,
      )
      let response: Response
      try {
        response = await fetchImplementation(
          `${configuration.data.baseUrl}/emails`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${configuration.data.apiKey}`,
              "Content-Type": "application/json",
              "Idempotency-Key": validated.data.idempotencyKey,
            },
            body: JSON.stringify({
              from: validated.data.from,
              html: validated.data.html,
              subject: validated.data.subject,
              to: validated.data.to,
              ...(validated.data.replyTo === undefined
                ? {}
                : { reply_to: validated.data.replyTo }),
              ...(validated.data.text === undefined
                ? {}
                : { text: validated.data.text }),
            }),
            signal: controller.signal,
          },
        )
      } catch (error) {
        if (controller.signal.aborted) {
          throw new ResendIntegrationError(
            "REQUEST_TIMEOUT",
            "Resend request timed out",
            { cause: error, retryable: true },
          )
        }
        throw new ResendIntegrationError(
          "REQUEST_FAILED",
          "Resend request failed",
          { cause: error, retryable: true },
        )
      } finally {
        clearTimeout(timeout)
      }

      if (!response.ok) {
        throw new ResendIntegrationError(
          "PROVIDER_REJECTED",
          `Resend returned HTTP ${response.status}`,
          {
            retryable: retryableStatus(response.status),
            status: response.status,
          },
        )
      }

      let body: unknown
      try {
        body = (await response.json()) as unknown
      } catch (error) {
        throw new ResendIntegrationError(
          "INVALID_RESPONSE",
          "Resend returned invalid JSON",
          { cause: error, retryable: true },
        )
      }
      const parsed = resendSendResponseSchema.safeParse(body)
      if (!parsed.success) {
        throw new ResendIntegrationError(
          "INVALID_RESPONSE",
          "Resend returned an invalid email response",
          { cause: parsed.error, retryable: true },
        )
      }

      return parsed.data
    },
  }
}

/** Official Resend SDK wrapper around the Standard Webhooks/Svix verifier. */
export function createResendWebhookVerifier() {
  return new Resend().webhooks
}
