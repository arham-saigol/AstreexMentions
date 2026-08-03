import { z } from "zod"

export const CREEM_PRODUCTION_API_BASE_URL = "https://api.creem.io/v1"
export const CREEM_TEST_API_BASE_URL = "https://test-api.creem.io/v1"
export const DEFAULT_CREEM_TIMEOUT_MS = 15_000

export const CREEM_WEBHOOK_EVENT_TYPES = [
  "checkout.completed",
  "subscription.active",
  "subscription.paid",
  "subscription.canceled",
  "subscription.scheduled_cancel",
  "subscription.past_due",
  "subscription.expired",
  "refund.created",
  "dispute.created",
  "subscription.update",
  "subscription.trialing",
  "subscription.paused",
] as const

export const CREEM_SUBSCRIPTION_WEBHOOK_EVENT_TYPES = [
  "subscription.active",
  "subscription.paid",
  "subscription.canceled",
  "subscription.scheduled_cancel",
  "subscription.past_due",
  "subscription.expired",
  "subscription.update",
  "subscription.trialing",
  "subscription.paused",
] as const

export type CreemWebhookEventType = (typeof CREEM_WEBHOOK_EVENT_TYPES)[number]
export type CreemSubscriptionWebhookEventType =
  (typeof CREEM_SUBSCRIPTION_WEBHOOK_EVENT_TYPES)[number]
export type CreemMode = "production" | "test"

export class CreemIntegrationError extends Error {
  readonly code:
    | "INVALID_CONFIGURATION"
    | "INVALID_INPUT"
    | "INVALID_RESPONSE"
    | "INVALID_SIGNATURE"
    | "PROVIDER_REJECTED"
    | "REQUEST_FAILED"
    | "REQUEST_TIMEOUT"
  readonly retryable: boolean
  readonly status?: number

  constructor(
    code: CreemIntegrationError["code"],
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
    this.name = "CreemIntegrationError"
    this.code = code
    this.retryable = options.retryable ?? false
    if (options.status !== undefined) {
      this.status = options.status
    }
  }
}

const nonEmptyStringSchema = z.string().trim().min(1)
const creemModeSchema = z.enum(["test", "prod", "sandbox", "local"])
const dateTimeSchema = z.string().datetime({ offset: true })
const metadataSchema = z.record(z.string(), z.unknown())

const creemProductSchema = z
  .object({
    id: nonEmptyStringSchema,
    object: z.string().optional(),
  })
  .passthrough()

const creemCustomerSchema = z
  .object({
    id: nonEmptyStringSchema,
    object: z.string().optional(),
  })
  .passthrough()

const creemSubscriptionItemSchema = z
  .object({
    id: nonEmptyStringSchema,
    mode: creemModeSchema,
    object: nonEmptyStringSchema,
    price_id: nonEmptyStringSchema.optional(),
    product_id: nonEmptyStringSchema.optional(),
    units: z.number().nullable().optional(),
  })
  .passthrough()

const creemReferenceSchema = <Schema extends z.ZodType>(schema: Schema) =>
  z.union([nonEmptyStringSchema, schema])

export const creemSubscriptionSchema = z
  .object({
    id: nonEmptyStringSchema,
    object: z.literal("subscription"),
    product: creemReferenceSchema(creemProductSchema),
    customer: creemReferenceSchema(creemCustomerSchema),
    items: z.array(creemSubscriptionItemSchema).optional(),
    collection_method: z.literal("charge_automatically"),
    status: nonEmptyStringSchema,
    last_transaction_id: nonEmptyStringSchema.optional(),
    last_transaction_date: dateTimeSchema.optional(),
    next_transaction_date: dateTimeSchema.optional(),
    current_period_start_date: dateTimeSchema.optional(),
    current_period_end_date: dateTimeSchema.optional(),
    canceled_at: dateTimeSchema.nullable().optional(),
    created_at: dateTimeSchema,
    updated_at: dateTimeSchema,
    metadata: metadataSchema.nullable().optional(),
    mode: creemModeSchema,
  })
  .passthrough()

export type CreemSubscription = z.infer<typeof creemSubscriptionSchema>

const creemCheckoutStatusSchema = z.enum([
  "pending",
  "processing",
  "completed",
  "expired",
])
const httpsUrlSchema = z
  .string()
  .url()
  .refine((value) => value.startsWith("https://"), {
    message: "Creem redirects must use HTTPS",
  })

const creemCheckoutResponseSchema = z
  .object({
    id: nonEmptyStringSchema,
    mode: z.enum(["test", "prod", "sandbox"]),
    object: nonEmptyStringSchema,
    status: creemCheckoutStatusSchema,
    product: creemReferenceSchema(creemProductSchema),
    request_id: nonEmptyStringSchema.optional(),
    checkout_url: httpsUrlSchema.optional(),
  })
  .passthrough()

const creemPortalResponseSchema = z
  .object({
    customer_portal_link: httpsUrlSchema,
  })
  .passthrough()

const creemRuntimeConfigSchema = z
  .object({
    apiKey: nonEmptyStringSchema,
    mode: z.enum(["production", "test"]),
    timeoutMs: z.number().finite().positive().default(DEFAULT_CREEM_TIMEOUT_MS),
  })
  .strict()

const createCheckoutInputSchema = z
  .object({
    customerEmail: z.string().email().optional(),
    metadata: metadataSchema.optional(),
    productId: nonEmptyStringSchema,
    requestId: nonEmptyStringSchema,
    successUrl: z.string().url(),
  })
  .strict()

const upgradeSubscriptionInputSchema = z
  .object({
    productId: nonEmptyStringSchema,
    subscriptionId: nonEmptyStringSchema,
  })
  .strict()

const createPortalInputSchema = z
  .object({
    customerId: nonEmptyStringSchema,
  })
  .strict()

export type CreemClient = {
  createBillingPortal(input: { customerId: string }): Promise<{ url: string }>
  getSubscription(subscriptionId: string): Promise<CreemSubscription>
  createCheckout(input: {
    customerEmail?: string
    metadata?: Record<string, unknown>
    productId: string
    requestId: string
    successUrl: string
  }): Promise<{
    checkoutId: string
    status: z.infer<typeof creemCheckoutStatusSchema>
    url: string
  }>
  upgradeSubscription(input: {
    productId: string
    subscriptionId: string
  }): Promise<CreemSubscription>
}

function parseExternalContract<Schema extends z.ZodType>(
  schema: Schema,
  value: unknown,
  label: string,
): z.infer<Schema> {
  const result = schema.safeParse(value)
  if (!result.success) {
    throw new CreemIntegrationError(
      "INVALID_RESPONSE",
      `Creem returned an invalid ${label}`,
      { cause: result.error },
    )
  }
  return result.data
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500
}

async function fetchCreemJson(input: {
  apiKey: string
  baseUrl: string
  body?: unknown
  fetchImplementation: typeof fetch
  method?: "GET" | "POST"
  path: string
  responseSchema: z.ZodType
  timeoutMs: number
}): Promise<unknown> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs)

  let response: Response
  try {
    response = await input.fetchImplementation(
      `${input.baseUrl}${input.path}`,
      {
        method: input.method ?? "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": input.apiKey,
        },
        ...(input.body === undefined
          ? {}
          : { body: JSON.stringify(input.body) }),
        signal: controller.signal,
      },
    )
  } catch (error) {
    if (controller.signal.aborted) {
      throw new CreemIntegrationError(
        "REQUEST_TIMEOUT",
        "Creem request timed out",
        { cause: error, retryable: true },
      )
    }
    throw new CreemIntegrationError("REQUEST_FAILED", "Creem request failed", {
      cause: error,
      retryable: true,
    })
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    throw new CreemIntegrationError(
      "PROVIDER_REJECTED",
      `Creem returned HTTP ${response.status}`,
      {
        retryable: isRetryableStatus(response.status),
        status: response.status,
      },
    )
  }

  let body: unknown
  try {
    body = (await response.json()) as unknown
  } catch (error) {
    throw new CreemIntegrationError(
      "INVALID_RESPONSE",
      "Creem returned invalid JSON",
      { cause: error },
    )
  }

  return parseExternalContract(input.responseSchema, body, "response")
}

export function createCreemClient(options: {
  apiKey: string
  fetch?: typeof fetch
  mode: CreemMode
  timeoutMs?: number
}): CreemClient {
  const parsed = creemRuntimeConfigSchema.safeParse({
    apiKey: options.apiKey,
    mode: options.mode,
    timeoutMs: options.timeoutMs,
  })
  if (!parsed.success) {
    throw new CreemIntegrationError(
      "INVALID_CONFIGURATION",
      "Creem client configuration is invalid",
      { cause: parsed.error },
    )
  }

  const fetchImplementation = options.fetch ?? fetch
  const baseUrl =
    parsed.data.mode === "production"
      ? CREEM_PRODUCTION_API_BASE_URL
      : CREEM_TEST_API_BASE_URL

  return {
    getSubscription: async (subscriptionId) => {
      const validated = nonEmptyStringSchema.safeParse(subscriptionId)
      if (!validated.success) {
        throw new CreemIntegrationError(
          "INVALID_INPUT",
          "Creem subscription id is invalid",
          { cause: validated.error },
        )
      }

      return (await fetchCreemJson({
        apiKey: parsed.data.apiKey,
        baseUrl,
        fetchImplementation,
        method: "GET",
        path: `/subscriptions/${encodeURIComponent(validated.data)}`,
        responseSchema: creemSubscriptionSchema,
        timeoutMs: parsed.data.timeoutMs,
      })) as CreemSubscription
    },

    createCheckout: async (input) => {
      const validated = createCheckoutInputSchema.safeParse(input)
      if (!validated.success) {
        throw new CreemIntegrationError(
          "INVALID_INPUT",
          "Creem checkout input is invalid",
          { cause: validated.error },
        )
      }

      const response = (await fetchCreemJson({
        apiKey: parsed.data.apiKey,
        baseUrl,
        body: {
          product_id: validated.data.productId,
          request_id: validated.data.requestId,
          success_url: validated.data.successUrl,
          ...(validated.data.customerEmail === undefined
            ? {}
            : { customer: { email: validated.data.customerEmail } }),
          ...(validated.data.metadata === undefined
            ? {}
            : { metadata: validated.data.metadata }),
        },
        fetchImplementation,
        path: "/checkouts",
        responseSchema: creemCheckoutResponseSchema,
        timeoutMs: parsed.data.timeoutMs,
      })) as z.infer<typeof creemCheckoutResponseSchema>

      if (!response.checkout_url) {
        throw new CreemIntegrationError(
          "INVALID_RESPONSE",
          "Creem checkout response is missing checkout_url",
        )
      }

      return {
        checkoutId: response.id,
        status: response.status,
        url: response.checkout_url,
      }
    },

    upgradeSubscription: async (input) => {
      const validated = upgradeSubscriptionInputSchema.safeParse(input)
      if (!validated.success) {
        throw new CreemIntegrationError(
          "INVALID_INPUT",
          "Creem subscription upgrade input is invalid",
          { cause: validated.error },
        )
      }

      return (await fetchCreemJson({
        apiKey: parsed.data.apiKey,
        baseUrl,
        body: {
          product_id: validated.data.productId,
          update_behavior: "proration-charge-immediately",
        },
        fetchImplementation,
        path: `/subscriptions/${encodeURIComponent(validated.data.subscriptionId)}/upgrade`,
        responseSchema: creemSubscriptionSchema,
        timeoutMs: parsed.data.timeoutMs,
      })) as CreemSubscription
    },

    createBillingPortal: async (input) => {
      const validated = createPortalInputSchema.safeParse(input)
      if (!validated.success) {
        throw new CreemIntegrationError(
          "INVALID_INPUT",
          "Creem customer portal input is invalid",
          { cause: validated.error },
        )
      }

      const response = (await fetchCreemJson({
        apiKey: parsed.data.apiKey,
        baseUrl,
        body: { customer_id: validated.data.customerId },
        fetchImplementation,
        path: "/customers/billing",
        responseSchema: creemPortalResponseSchema,
        timeoutMs: parsed.data.timeoutMs,
      })) as z.infer<typeof creemPortalResponseSchema>

      return { url: response.customer_portal_link }
    },
  }
}

const webhookEnvelopeSchema = z.object({
  id: nonEmptyStringSchema,
  created_at: z.number().int().nonnegative(),
})

const checkoutWebhookObjectSchema = z
  .object({
    id: nonEmptyStringSchema,
    object: z.literal("checkout"),
    request_id: nonEmptyStringSchema.optional(),
    product: creemReferenceSchema(creemProductSchema),
    customer: creemReferenceSchema(creemCustomerSchema).optional(),
    subscription: creemReferenceSchema(creemSubscriptionSchema).optional(),
    status: creemCheckoutStatusSchema,
    metadata: metadataSchema.optional(),
    mode: creemModeSchema,
  })
  .passthrough()

const refundWebhookObjectSchema = z
  .object({
    id: nonEmptyStringSchema,
    status: nonEmptyStringSchema,
    mode: creemModeSchema,
  })
  .passthrough()

const disputeWebhookObjectSchema = z
  .object({
    id: nonEmptyStringSchema,
    mode: creemModeSchema,
  })
  .passthrough()

const checkoutWebhookEventSchema = webhookEnvelopeSchema.extend({
  eventType: z.literal("checkout.completed"),
  object: checkoutWebhookObjectSchema,
})

const subscriptionWebhookEventSchema = webhookEnvelopeSchema.extend({
  eventType: z.enum(CREEM_SUBSCRIPTION_WEBHOOK_EVENT_TYPES),
  object: creemSubscriptionSchema,
})

const refundWebhookEventSchema = webhookEnvelopeSchema.extend({
  eventType: z.literal("refund.created"),
  object: refundWebhookObjectSchema,
})

const disputeWebhookEventSchema = webhookEnvelopeSchema.extend({
  eventType: z.literal("dispute.created"),
  object: disputeWebhookObjectSchema,
})

export const creemWebhookEventSchema = z.union([
  checkoutWebhookEventSchema,
  subscriptionWebhookEventSchema,
  refundWebhookEventSchema,
  disputeWebhookEventSchema,
])

export type CreemWebhookEvent = z.infer<typeof creemWebhookEventSchema>
export type CreemSubscriptionWebhookEvent = z.infer<
  typeof subscriptionWebhookEventSchema
>

export function parseCreemWebhookEvent(rawBody: string): CreemWebhookEvent {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody) as unknown
  } catch (error) {
    throw new CreemIntegrationError(
      "INVALID_RESPONSE",
      "Creem webhook body is not valid JSON",
      { cause: error },
    )
  }

  return parseExternalContract(creemWebhookEventSchema, parsed, "webhook event")
}

function bytesToHex(bytes: Uint8Array): string {
  let result = ""
  for (const byte of bytes) {
    result += byte.toString(16).padStart(2, "0")
  }
  return result
}

function timingSafeHexEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false
  }

  let difference = 0
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return difference === 0
}

/** Verifies Creem's creem-signature over the unmodified raw request body. */
export async function verifyCreemWebhookSignature(input: {
  rawBody: string
  secret: string
  signature: string
}): Promise<boolean> {
  const secret = input.secret
  const signature = input.signature.trim().toLowerCase()
  if (secret.length === 0 || !/^[a-f0-9]{64}$/.test(signature)) {
    return false
  }

  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  )
  const digest = await globalThis.crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(input.rawBody),
  )

  return timingSafeHexEqual(bytesToHex(new Uint8Array(digest)), signature)
}

export function isCreemSubscriptionWebhookEvent(
  event: CreemWebhookEvent,
): event is CreemSubscriptionWebhookEvent {
  return (CREEM_SUBSCRIPTION_WEBHOOK_EVENT_TYPES as readonly string[]).includes(
    event.eventType,
  )
}

export function creemReferenceId(reference: string | { id: string }): string {
  return typeof reference === "string" ? reference : reference.id
}

export function creemWebhookObjectId(event: CreemWebhookEvent): string {
  return event.object.id
}

export function creemWebhookLivemode(event: CreemWebhookEvent): boolean {
  return event.object.mode === "prod"
}

function optionalDateTimeToEpoch(
  value: string | null | undefined,
): number | undefined {
  if (value === undefined || value === null) {
    return undefined
  }
  const epoch = Date.parse(value)
  if (!Number.isFinite(epoch)) {
    throw new CreemIntegrationError(
      "INVALID_RESPONSE",
      "Creem subscription contains an invalid date",
    )
  }
  return epoch
}

export type NormalizedCreemSubscription = {
  canceledAt?: number
  currentPeriodEnd?: number
  currentPeriodStart?: number
  metadataInternalCustomerId?: string
  mode: CreemSubscription["mode"]
  productId: string
  providerCustomerId: string
  providerPriceId?: string
  providerSubscriptionId: string
  status: string
  updatedAt: number
}

export function normalizeCreemSubscription(
  subscription: CreemSubscription,
): NormalizedCreemSubscription {
  const firstItem = subscription.items?.[0]
  const metadataInternalCustomerId = subscription.metadata?.internal_customer_id
  const canceledAt = optionalDateTimeToEpoch(subscription.canceled_at)
  const currentPeriodEnd = optionalDateTimeToEpoch(
    subscription.current_period_end_date,
  )
  const currentPeriodStart = optionalDateTimeToEpoch(
    subscription.current_period_start_date,
  )

  return {
    ...(canceledAt === undefined ? {} : { canceledAt }),
    ...(currentPeriodEnd === undefined ? {} : { currentPeriodEnd }),
    ...(currentPeriodStart === undefined ? {} : { currentPeriodStart }),
    ...(typeof metadataInternalCustomerId === "string" &&
    metadataInternalCustomerId.trim().length > 0
      ? { metadataInternalCustomerId: metadataInternalCustomerId.trim() }
      : {}),
    mode: subscription.mode,
    productId: creemReferenceId(subscription.product),
    providerCustomerId: creemReferenceId(subscription.customer),
    ...(firstItem?.price_id === undefined
      ? {}
      : { providerPriceId: firstItem.price_id }),
    providerSubscriptionId: subscription.id,
    status: subscription.status,
    updatedAt: optionalDateTimeToEpoch(subscription.updated_at) ?? 0,
  }
}
