import { z } from "zod"

import { DEFAULT_PROVIDER_TIMEOUT_MS } from "../integrations/providers"
import {
  HOUR_MS,
  MINUTE_MS,
  trackingProviderForSourceType,
  type ProviderDispatchPolicy,
  type TrackingProvider,
  type TrackingSourceType,
} from "./model"

export type SchedulingEnvironment = Readonly<Record<string, string | undefined>>

export type SchedulingProviderUnconfigured = Readonly<{
  missing: readonly string[]
  provider: TrackingProvider
  state: "provider_unconfigured"
}>

export type ProviderRuntimeConfiguration = Readonly<{
  apiKey?: string | undefined
  provider: TrackingProvider
  state: "configured"
  timeoutMs: number
}>

export type SchedulingDispatchConfiguration = Readonly<{
  policies: Readonly<Record<TrackingProvider, ProviderDispatchPolicy>>
  state: "configured"
}>

export type SchedulingDispatchUnconfigured = Readonly<{
  invalid: readonly string[]
  state: "provider_unconfigured"
}>

const positiveIntegerFromEnvironment = z.preprocess((value) => {
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined
  }
  return value.trim()
}, z.coerce.number().int().positive().optional())

const dispatchEnvironmentSchema = z
  .object({
    FETCHLAYER_REQUESTS_PER_MINUTE: positiveIntegerFromEnvironment.default(30),
    HN_REQUESTS_PER_HOUR: positiveIntegerFromEnvironment.default(9_000),
    XQUIK_REQUESTS_PER_SECOND: positiveIntegerFromEnvironment.default(100),
  })
  .strip()

function providerUnconfigured(
  provider: TrackingProvider,
  ...missing: string[]
): SchedulingProviderUnconfigured {
  return {
    missing: [...new Set(missing)].sort(),
    provider,
    state: "provider_unconfigured",
  }
}

export function readSchedulingDispatchConfiguration(
  environment: SchedulingEnvironment,
): SchedulingDispatchConfiguration | SchedulingDispatchUnconfigured {
  const result = dispatchEnvironmentSchema.safeParse(environment)
  if (!result.success) {
    const invalid = result.error.issues
      .map((issue) => String(issue.path[0] ?? "scheduling_environment"))
      .filter((value, index, values) => values.indexOf(value) === index)
      .sort()
    return { invalid, state: "provider_unconfigured" }
  }

  const xRequestsPerSecond = result.data.XQUIK_REQUESTS_PER_SECOND
  const redditRequestsPerMinute = result.data.FETCHLAYER_REQUESTS_PER_MINUTE
  const hackerNewsRequestsPerHour = result.data.HN_REQUESTS_PER_HOUR

  return {
    policies: {
      algolia_hacker_news: {
        circuitCooldownMs: 5 * MINUTE_MS,
        circuitFailureThreshold: 5,
        hourlyRequestBudget: hackerNewsRequestsPerHour,
        maxClaimsPerMinute: Math.min(12, hackerNewsRequestsPerHour),
        provider: "algolia_hacker_news",
      },
      fetchlayer_reddit: {
        circuitCooldownMs: 10 * MINUTE_MS,
        circuitFailureThreshold: 4,
        hourlyRequestBudget: redditRequestsPerMinute * 60,
        maxClaimsPerMinute: redditRequestsPerMinute,
        provider: "fetchlayer_reddit",
      },
      xquik: {
        circuitCooldownMs: 5 * MINUTE_MS,
        circuitFailureThreshold: 5,
        hourlyRequestBudget: xRequestsPerSecond * (HOUR_MS / 1_000),
        maxClaimsPerMinute: Math.min(60, xRequestsPerSecond * 55),
        provider: "xquik",
      },
    },
    state: "configured",
  }
}

export function readProviderRuntimeConfiguration(
  environment: SchedulingEnvironment,
  sourceType: TrackingSourceType,
): ProviderRuntimeConfiguration | SchedulingProviderUnconfigured {
  const provider = trackingProviderForSourceType(sourceType)
  if (provider === "algolia_hacker_news") {
    return {
      provider,
      state: "configured",
      timeoutMs: DEFAULT_PROVIDER_TIMEOUT_MS,
    }
  }

  const variable = provider === "xquik" ? "XQUIK_API_KEY" : "FETCHLAYER_API_KEY"
  const parsed = z.string().trim().min(1).safeParse(environment[variable])
  if (!parsed.success) {
    return providerUnconfigured(provider, variable)
  }

  return {
    apiKey: parsed.data,
    provider,
    state: "configured",
    timeoutMs: DEFAULT_PROVIDER_TIMEOUT_MS,
  }
}
