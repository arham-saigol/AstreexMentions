import { z } from "zod"

import { isRetryableResendFailure, type LeasedEmailOutbox } from "./emailOutbox"

export type ResendSendResponse =
  | {
      data: { id: string }
      error: null
    }
  | {
      data: null
      error: {
        message: string
        name?: string | undefined
        statusCode: number | null
      }
    }

const resendSendResponseSchema = z.union([
  z
    .object({
      data: z.object({ id: z.string() }).strict(),
      error: z.null(),
    })
    .strict(),
  z
    .object({
      data: z.null(),
      error: z
        .object({
          message: z.string(),
          name: z.string().optional(),
          statusCode: z.number().int().nullable(),
        })
        .strict(),
    })
    .strict(),
])

export type ResendEmailClient = {
  emails: {
    send(
      payload: {
        from: string
        html: string
        replyTo?: string
        subject: string
        text?: string
        to: string[]
      },
      options: { idempotencyKey: string },
    ): Promise<ResendSendResponse>
  }
}

export class ResendSendError extends Error {
  readonly retryable: boolean
  readonly statusCode?: number

  constructor(
    message: string,
    options: { cause?: unknown; retryable: boolean; statusCode?: number },
  ) {
    super(
      message,
      options.cause === undefined ? undefined : { cause: options.cause },
    )
    this.name = "ResendSendError"
    this.retryable = options.retryable
    if (options.statusCode !== undefined) {
      this.statusCode = options.statusCode
    }
  }
}

/**
 * Uses the durable outbox key as Resend's Idempotency-Key. If a lease expires
 * after the provider accepted a request but before Convex records success, a
 * replacement worker can safely issue the same request without another email.
 */
export async function sendLeasedEmailWithResend(
  client: ResendEmailClient,
  outbox: LeasedEmailOutbox,
): Promise<string> {
  const payload = {
    from: outbox.payload.from,
    html: outbox.payload.html,
    subject: outbox.payload.subject,
    to: [...outbox.payload.to],
    ...(outbox.payload.replyTo === undefined
      ? {}
      : { replyTo: outbox.payload.replyTo }),
    ...(outbox.payload.text === undefined ? {} : { text: outbox.payload.text }),
  }

  let response: ResendSendResponse
  try {
    response = await client.emails.send(payload, {
      idempotencyKey: outbox.idempotencyKey,
    })
  } catch (error) {
    throw new ResendSendError("Resend request failed", {
      cause: error,
      retryable: isRetryableResendFailure(error),
    })
  }
  const parsedResponse = resendSendResponseSchema.safeParse(response)
  if (!parsedResponse.success) {
    throw new ResendSendError("Resend returned an invalid response", {
      cause: parsedResponse.error,
      retryable: true,
    })
  }
  response = parsedResponse.data

  if (response.error) {
    const statusCode = response.error.statusCode ?? undefined
    throw new ResendSendError(response.error.message, {
      retryable: isRetryableResendFailure({ statusCode }),
      ...(statusCode === undefined ? {} : { statusCode }),
    })
  }

  if (response.data.id.length === 0) {
    throw new ResendSendError("Resend returned an empty email id", {
      retryable: true,
    })
  }

  return response.data.id
}
