import { z } from "zod"

import { DEFAULT_RESEND_TIMEOUT_MS } from "../integrations/resend"

export type EmailEnvironment = Readonly<Record<string, string | undefined>>

export type ResendProviderUnconfigured = Readonly<{
  missing: string[]
  provider: "resend"
  state: "provider_unconfigured"
}>

export type EmailSenderConfiguration = Readonly<{
  from: string
  replyTo?: string | undefined
  state: "configured"
}>

export type EmailCompositionConfiguration = EmailSenderConfiguration &
  Readonly<{
    appUrl: string
  }>

export type ResendDeliveryConfiguration = Readonly<{
  apiKey: string
  state: "configured"
  timeoutMs: number
}>

export type ResendWebhookConfiguration = Readonly<{
  state: "configured"
  webhookSecret: string
}>

const nonEmptyStringSchema = z.string().trim().min(1)
const urlSchema = z.string().url()
const timeoutSchema = z.coerce.number().int().positive()

function providerUnconfigured(
  ...missing: string[]
): ResendProviderUnconfigured {
  return {
    missing: [...new Set(missing)].sort(),
    provider: "resend",
    state: "provider_unconfigured",
  }
}

export function readEmailSenderConfiguration(
  environment: EmailEnvironment,
): EmailSenderConfiguration | ResendProviderUnconfigured {
  const from = nonEmptyStringSchema.safeParse(environment.RESEND_FROM_EMAIL)
  const replyToValue = environment.RESEND_REPLY_TO_EMAIL?.trim()
  const replyTo =
    replyToValue === undefined || replyToValue.length === 0
      ? undefined
      : nonEmptyStringSchema.safeParse(replyToValue)
  const missing = [
    ...(from.success ? [] : ["RESEND_FROM_EMAIL"]),
    ...(replyTo === undefined || replyTo.success
      ? []
      : ["RESEND_REPLY_TO_EMAIL"]),
  ]

  if (
    missing.length > 0 ||
    !from.success ||
    (replyTo !== undefined && !replyTo.success)
  ) {
    return providerUnconfigured(...missing)
  }

  return {
    from: from.data,
    ...(replyTo === undefined ? {} : { replyTo: replyTo.data }),
    state: "configured",
  }
}

export function readEmailCompositionConfiguration(
  environment: EmailEnvironment,
): EmailCompositionConfiguration | ResendProviderUnconfigured {
  const sender = readEmailSenderConfiguration(environment)
  const appUrl = urlSchema.safeParse(environment.APP_URL)
  const missing = [
    ...(sender.state === "provider_unconfigured" ? sender.missing : []),
    ...(appUrl.success ? [] : ["APP_URL"]),
  ]
  if (sender.state === "provider_unconfigured" || !appUrl.success) {
    return providerUnconfigured(...missing)
  }

  return {
    ...sender,
    appUrl: appUrl.data,
  }
}

export function readResendDeliveryConfiguration(
  environment: EmailEnvironment,
): ResendDeliveryConfiguration | ResendProviderUnconfigured {
  const apiKey = nonEmptyStringSchema.safeParse(environment.RESEND_API_KEY)
  const timeoutValue = environment.RESEND_TIMEOUT_MS?.trim()
  const timeout =
    timeoutValue === undefined || timeoutValue.length === 0
      ? { data: DEFAULT_RESEND_TIMEOUT_MS, success: true as const }
      : timeoutSchema.safeParse(timeoutValue)
  const missing = [
    ...(apiKey.success ? [] : ["RESEND_API_KEY"]),
    ...(timeout.success ? [] : ["RESEND_TIMEOUT_MS"]),
  ]

  if (missing.length > 0 || !apiKey.success || !timeout.success) {
    return providerUnconfigured(...missing)
  }

  return {
    apiKey: apiKey.data,
    state: "configured",
    timeoutMs: timeout.data,
  }
}

export function readResendWebhookConfiguration(
  environment: EmailEnvironment,
): ResendWebhookConfiguration | ResendProviderUnconfigured {
  const webhookSecret = nonEmptyStringSchema.safeParse(
    environment.RESEND_WEBHOOK_SECRET,
  )
  if (!webhookSecret.success) {
    return providerUnconfigured("RESEND_WEBHOOK_SECRET")
  }

  return { state: "configured", webhookSecret: webhookSecret.data }
}
