import { describe, expect, it } from "vitest"

import {
  createOnboardingDraft,
  MAX_DRAFT_KEYWORDS,
  normalizeKeywordPhrase,
  onboardingDraftSchema,
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
})
