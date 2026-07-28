const checkoutEligibleStatuses = new Set(["canceled", "expired"])

export function subscriptionAllowsNewCheckout(status: string | null): boolean {
  return status === null || checkoutEligibleStatuses.has(status)
}
