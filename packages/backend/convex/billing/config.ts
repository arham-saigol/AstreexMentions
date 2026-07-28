import { z } from "zod"
import { PLAN_IDS, PLANS } from "@astreex/domain"

import { DEFAULT_CREEM_TIMEOUT_MS, type CreemMode } from "../integrations/creem"
import type { AstreexPlanId } from "../lib/creemBilling"

export type CreemPlanMapping = Readonly<{
  keywordLimit: number
  mentionLimit: number
  planId: AstreexPlanId
  productId: string
}>

export type ProviderUnconfigured = Readonly<{
  missing: string[]
  state: "provider_unconfigured"
}>

export type CreemApiConfiguration = Readonly<{
  apiKey: string
  mode: CreemMode
  state: "configured"
  timeoutMs: number
}>

export type CreemCheckoutConfiguration = CreemApiConfiguration &
  Readonly<{
    plan: CreemPlanMapping
    successUrl: string
  }>

export type CreemWebhookConfiguration = Readonly<{
  plansByProductId: ReadonlyMap<string, CreemPlanMapping>
  state: "configured"
  webhookSecret: string
}>

type Environment = Readonly<Record<string, string | undefined>>

const modeSchema = z.enum(["production", "test"])
const positiveTimeoutSchema = z.coerce.number().finite().positive()
const CREEM_PRODUCT_ENV_BY_PLAN = {
  growth: "CREEM_PRODUCT_ID_GROWTH",
  scale: "CREEM_PRODUCT_ID_SCALE",
  starter: "CREEM_PRODUCT_ID_STARTER",
} as const satisfies Readonly<Record<AstreexPlanId, string>>

export const CREEM_PRODUCT_ENV_NAMES = Object.freeze(
  PLAN_IDS.map((planId) => CREEM_PRODUCT_ENV_BY_PLAN[planId]),
)

function providerUnconfigured(...missing: string[]): ProviderUnconfigured {
  return {
    missing: [...new Set(missing)].sort(),
    state: "provider_unconfigured",
  }
}

export function isProviderUnconfigured(
  value: ReadonlyMap<string, CreemPlanMapping> | ProviderUnconfigured,
): value is ProviderUnconfigured {
  return "state" in value && value.state === "provider_unconfigured"
}

export function readCreemApiConfiguration(
  environment: Environment,
): CreemApiConfiguration | ProviderUnconfigured {
  const missing: string[] = []
  const apiKey = environment.CREEM_API_KEY?.trim()
  if (!apiKey) {
    missing.push("CREEM_API_KEY")
  }

  const modeResult = modeSchema.safeParse(environment.CREEM_MODE)
  if (!modeResult.success) {
    missing.push("CREEM_MODE")
  }

  const timeoutValue = environment.CREEM_TIMEOUT_MS?.trim()
  const timeoutResult =
    timeoutValue === undefined || timeoutValue.length === 0
      ? { data: DEFAULT_CREEM_TIMEOUT_MS, success: true as const }
      : positiveTimeoutSchema.safeParse(timeoutValue)
  if (!timeoutResult.success) {
    missing.push("CREEM_TIMEOUT_MS")
  }

  if (
    missing.length > 0 ||
    !apiKey ||
    !modeResult.success ||
    !timeoutResult.success
  ) {
    return providerUnconfigured(...missing)
  }

  return {
    apiKey,
    mode: modeResult.data,
    state: "configured",
    timeoutMs: timeoutResult.data,
  }
}

export function readCreemProductAllowlist(
  environment: Environment,
): ReadonlyMap<string, CreemPlanMapping> | ProviderUnconfigured {
  const productIds = PLAN_IDS.map((planId) => {
    const environmentName = CREEM_PRODUCT_ENV_BY_PLAN[planId]
    return {
      environmentName,
      planId,
      productId: environment[environmentName]?.trim(),
    }
  })
  const missing = productIds
    .filter(({ productId }) => !productId)
    .map(({ environmentName }) => environmentName)
  if (missing.length > 0) {
    return providerUnconfigured(...missing)
  }

  const configuredProductIds = productIds.map(({ productId }) => productId!)
  if (new Set(configuredProductIds).size !== configuredProductIds.length) {
    return providerUnconfigured(...CREEM_PRODUCT_ENV_NAMES)
  }

  const plansByProductId = new Map<string, CreemPlanMapping>()
  for (const { planId, productId } of productIds) {
    const plan = PLANS[planId]
    const configuredProductId = productId!
    plansByProductId.set(configuredProductId, {
      keywordLimit: plan.keywordLimit,
      mentionLimit: plan.monthlyMentionLimit,
      planId,
      productId: configuredProductId,
    })
  }

  return plansByProductId
}

export function readCreemCheckoutConfiguration(
  environment: Environment,
  planId: AstreexPlanId,
): CreemCheckoutConfiguration | ProviderUnconfigured {
  const api = readCreemApiConfiguration(environment)
  const allowlist = readCreemProductAllowlist(environment)
  const successUrlResult = z
    .string()
    .url()
    .safeParse(environment.CREEM_CHECKOUT_SUCCESS_URL)

  const missing = [
    ...(api.state === "provider_unconfigured" ? api.missing : []),
    ...(!isProviderUnconfigured(allowlist) ? [] : allowlist.missing),
    ...(successUrlResult.success ? [] : ["CREEM_CHECKOUT_SUCCESS_URL"]),
  ]
  if (missing.length > 0 || api.state === "provider_unconfigured") {
    return providerUnconfigured(...missing)
  }
  if (isProviderUnconfigured(allowlist)) {
    return providerUnconfigured(...allowlist.missing)
  }

  const plan = [...allowlist.values()].find(
    (candidate) => candidate.planId === planId,
  )
  if (!plan) {
    return providerUnconfigured(`CREEM_PRODUCT_${planId.toUpperCase()}`)
  }
  if (!successUrlResult.success) {
    return providerUnconfigured("CREEM_CHECKOUT_SUCCESS_URL")
  }

  return {
    ...api,
    plan,
    successUrl: successUrlResult.data,
  }
}

export function readCreemUpgradeConfiguration(
  environment: Environment,
  planId: AstreexPlanId,
):
  | (CreemApiConfiguration & Readonly<{ plan: CreemPlanMapping }>)
  | ProviderUnconfigured {
  const api = readCreemApiConfiguration(environment)
  const allowlist = readCreemProductAllowlist(environment)
  const missing = [
    ...(api.state === "provider_unconfigured" ? api.missing : []),
    ...(!isProviderUnconfigured(allowlist) ? [] : allowlist.missing),
  ]
  if (missing.length > 0 || api.state === "provider_unconfigured") {
    return providerUnconfigured(...missing)
  }
  if (isProviderUnconfigured(allowlist)) {
    return providerUnconfigured(...allowlist.missing)
  }

  const plan = [...allowlist.values()].find(
    (candidate) => candidate.planId === planId,
  )
  if (!plan) {
    return providerUnconfigured(`CREEM_PRODUCT_${planId.toUpperCase()}`)
  }

  return { ...api, plan }
}

export function readCreemWebhookConfiguration(
  environment: Environment,
): CreemWebhookConfiguration | ProviderUnconfigured {
  const configuredWebhookSecret = environment.CREEM_WEBHOOK_SECRET
  const webhookSecret =
    configuredWebhookSecret?.trim().length === 0
      ? undefined
      : configuredWebhookSecret
  const allowlist = readCreemProductAllowlist(environment)
  const missing = [
    ...(webhookSecret ? [] : ["CREEM_WEBHOOK_SECRET"]),
    ...(!isProviderUnconfigured(allowlist) ? [] : allowlist.missing),
  ]
  if (!webhookSecret || isProviderUnconfigured(allowlist)) {
    return providerUnconfigured(...missing)
  }

  return {
    plansByProductId: allowlist,
    state: "configured",
    webhookSecret,
  }
}
