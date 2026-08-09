import { describe, expect, it, vi } from "vitest"

import {
  canReuseOnboardingCheckout,
  clearOnboardingDraftStorage,
  CHECKOUT_INTENT_TTL_MS,
  createOnboardingDraft,
  MAX_DRAFT_KEYWORDS,
  normalizeKeywordPhrase,
  onboardingDraftSchema,
} from "./onboarding-draft"

function keyword(index: number) {
  return {
    brandCandidate: index === 0,
    clientId: `keyword-${index}`,
    description: `Why keyword ${index} matters`,
    phrase: `Keyword ${index}`,
    platforms: ["x" as const],
    selected: true,
  }
}

describe("onboarding draft", () => {
  it("stores the new three-step free-evaluation draft without category or keyword-kind state", () => {
    const draft = createOnboardingDraft("Astreex")
    const parsed = onboardingDraftSchema.parse({
      ...draft,
      companyDescription: "Astreex monitors customer conversations.",
      keywords: [keyword(0)],
      selectedPlan: "free",
      step: 3,
      websiteUrl: "https://astreex.example/",
    })

    expect(parsed).toMatchObject({ selectedPlan: "free", step: 3, version: 2 })
    expect(parsed).not.toHaveProperty("categories")
    expect(parsed.keywords[0]).not.toHaveProperty("kind")
  })

  it("requires selected keywords to have a phrase, description within 160 characters, and a platform", () => {
    const draft = createOnboardingDraft("Astreex")
    expect(
      onboardingDraftSchema.safeParse({
        ...draft,
        keywords: [{ ...keyword(0), platforms: [] }],
      }).success,
    ).toBe(false)
    expect(
      onboardingDraftSchema.safeParse({
        ...draft,
        keywords: [{ ...keyword(0), description: "x".repeat(161) }],
      }).success,
    ).toBe(false)
  })

  it("accepts ten keyword configurations and rejects an unbounded draft", () => {
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

  it("supports free and paid selections while preserving an outstanding checkout", () => {
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
        { ...checkout, startedAt: now - CHECKOUT_INTENT_TTL_MS },
        now,
      ),
    ).toBe(false)
  })

  it("normalizes duplicate phrases and clears only the version-two workspace draft", () => {
    expect(normalizeKeywordPhrase("  Astreex   Monitor ")).toBe(
      "astreex monitor",
    )
    const removeItem = vi.fn()
    clearOnboardingDraftStorage({ removeItem }, "workspace_1")
    expect(removeItem).toHaveBeenCalledWith("astreex:onboarding:workspace_1:v2")
  })
})
