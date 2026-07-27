import { describe, expect, it } from "vitest"

import {
  canReuseOnboardingCheckout,
  CHECKOUT_INTENT_TTL_MS,
  createOnboardingDraft,
  isCompletedOnboardingCheckout,
  MAX_DRAFT_KEYWORDS,
  normalizeKeywordPhrase,
  onboardingDraftSchema,
  selectOnboardingPlan,
} from "./onboarding-draft"

function keyword(index: number) {
  return {
    clientId: `keyword-${index}`,
    kind: "own" as const,
    phrase: `Keyword ${index}`,
    platforms: ["x" as const],
  }
}

describe("onboarding draft", () => {
  it("normalizes phrases for duplicate checks", () => {
    expect(normalizeKeywordPhrase("  Astreex   Monitor ")).toBe(
      "astreex monitor",
    )
  })

  it("accepts ten keywords and rejects a larger client draft", () => {
    const draft = createOnboardingDraft("Astreex")

    expect(
      onboardingDraftSchema.safeParse({
        ...draft,
        keywords: Array.from({ length: MAX_DRAFT_KEYWORDS }, (_, index) =>
          keyword(index),
        ),
      }).success,
    ).toBe(true)

    expect(
      onboardingDraftSchema.safeParse({
        ...draft,
        keywords: Array.from({ length: MAX_DRAFT_KEYWORDS + 1 }, (_, index) =>
          keyword(index),
        ),
      }).success,
    ).toBe(false)
  })

  it("rejects a persisted draft that weakens the Other category invariant", () => {
    const draft = createOnboardingDraft("Astreex")
    const category = {
      colorToken: "gray" as const,
      description: "Fallback category",
      enabled: false,
      isSystem: true,
      name: "Other",
      serverId: "category_other",
      systemKey: "other" as const,
    }

    expect(
      onboardingDraftSchema.safeParse({
        ...draft,
        categories: [category],
      }).success,
    ).toBe(false)

    expect(
      onboardingDraftSchema.safeParse({
        ...draft,
        categories: [{ ...category, enabled: true }],
      }).success,
    ).toBe(true)
  })

  it("reuses only current nonterminal checkout intents", () => {
    const now = 2_000_000_000_000
    const checkout = {
      idempotencyKey: "checkout-current",
      planId: "growth" as const,
      startedAt: now - 60_000,
      status: "open",
      url: "https://checkout.example/session",
    }

    expect(canReuseOnboardingCheckout(checkout, now)).toBe(true)
    expect(
      canReuseOnboardingCheckout(
        {
          ...checkout,
          startedAt: now - CHECKOUT_INTENT_TTL_MS,
        },
        now,
      ),
    ).toBe(false)
    expect(
      canReuseOnboardingCheckout({ ...checkout, status: "expired" }, now),
    ).toBe(false)
    expect(
      canReuseOnboardingCheckout({ ...checkout, startedAt: now + 1 }, now),
    ).toBe(false)
    expect(
      onboardingDraftSchema.safeParse({
        ...createOnboardingDraft("Astreex"),
        checkout: {
          ...checkout,
          url: "javascript:alert(document.domain)",
        },
      }).success,
    ).toBe(false)
  })

  it("recognizes completed checkout statuses without opening another session", () => {
    const checkout = {
      idempotencyKey: "checkout-complete",
      planId: "scale" as const,
      startedAt: 1,
      status: "completed",
    }

    expect(isCompletedOnboardingCheckout(checkout)).toBe(true)
    expect(isCompletedOnboardingCheckout({ ...checkout, status: "open" })).toBe(
      false,
    )
  })

  it("preserves an outstanding checkout when selecting another plan", () => {
    const draft = {
      ...createOnboardingDraft("Astreex"),
      checkout: {
        idempotencyKey: "checkout-outstanding",
        planId: "starter" as const,
        startedAt: 2_000_000_000_000,
        status: "open",
        url: "https://checkout.example/session",
      },
      selectedPlan: "starter" as const,
      step: 7 as const,
    }

    expect(selectOnboardingPlan(draft, "growth")).toMatchObject({
      checkout: draft.checkout,
      selectedPlan: "growth",
    })
  })
})
