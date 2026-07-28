export const USAGE_NOTIFICATION_THRESHOLDS = [80, 100] as const
export type UsageNotificationThreshold =
  (typeof USAGE_NOTIFICATION_THRESHOLDS)[number]

export type UsageSnapshot = {
  currentUsage: number
  limit: number
  previousUsage: number
}

function assertUsageCount(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`)
  }
}

export function usagePercentage(usage: number, limit: number): number {
  assertUsageCount("usage", usage)
  assertUsageCount("limit", limit)
  if (limit === 0) {
    throw new RangeError("limit must be greater than zero")
  }
  return (usage / limit) * 100
}

/** Returns only newly crossed product notification thresholds, in order. */
export function getUsageThresholdCrossings({
  currentUsage,
  limit,
  previousUsage,
}: UsageSnapshot): UsageNotificationThreshold[] {
  assertUsageCount("previousUsage", previousUsage)
  assertUsageCount("currentUsage", currentUsage)
  assertUsageCount("limit", limit)
  if (limit === 0) {
    throw new RangeError("limit must be greater than zero")
  }
  if (currentUsage < previousUsage) {
    return []
  }

  const previousPercentage = (previousUsage / limit) * 100
  const currentPercentage = (currentUsage / limit) * 100
  return USAGE_NOTIFICATION_THRESHOLDS.filter(
    (threshold) =>
      previousPercentage < threshold && currentPercentage >= threshold,
  )
}

export const crossedUsageThresholds = getUsageThresholdCrossings
