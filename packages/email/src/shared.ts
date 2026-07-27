import { getPlanDefinition, type PlanId } from "@astreex/domain"

export const ASTREEX_BRAND = "Astreex"
export const USAGE_WARNING_PERCENTAGE = 80

const integerFormatter = new Intl.NumberFormat("en-US")

export function formatInteger(value: number): string {
  assertNonNegativeSafeInteger("value", value)
  return integerFormatter.format(value)
}

export function assertNonNegativeSafeInteger(
  name: string,
  value: number,
): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`)
  }
}

export function normalizeAstreexUrl(rawUrl: string): string {
  let url: URL
  try {
    url = new URL(rawUrl.trim())
  } catch (error) {
    throw new TypeError("Astreex URL must be an absolute URL", { cause: error })
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError("Astreex URL must use HTTP or HTTPS")
  }
  if (url.username || url.password) {
    throw new TypeError("Astreex URL cannot contain credentials")
  }

  url.hash = ""
  return url.toString()
}

export function planDetails(planId: PlanId): {
  keywordLimit: string
  mentionLimit: string
  name: string
  price: string
} {
  const plan = getPlanDefinition(planId)
  return {
    keywordLimit: formatInteger(plan.keywordLimit),
    mentionLimit: formatInteger(plan.monthlyMentionLimit),
    name: plan.name,
    price: `$${formatInteger(plan.priceUsd)}/month`,
  }
}

export function greeting(recipientName?: string): string {
  const name = recipientName?.trim()
  return name ? `Hello ${name},` : "Hello,"
}
