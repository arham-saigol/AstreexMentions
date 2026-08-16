import { z } from "zod"

const onboardingPlatformSchema = z.enum(["x", "reddit", "hacker_news"])

export const MAX_DRAFT_KEYWORDS = 10
export const CHECKOUT_INTENT_TTL_MS = 24 * 60 * 60 * 1_000

export const onboardingStepSchema = z.number().int().min(1).max(3)

export const onboardingKeywordDraftSchema = z
  .object({
    brandCandidate: z.boolean(),
    clientId: z.string().trim().min(1),
    description: z.string().trim().max(160),
    phrase: z.string().trim().min(1).max(160),
    origin: z.enum(["custom", "suggestion"]),
    platforms: z.array(onboardingPlatformSchema).min(1),
    selected: z.boolean(),
  })
  .strict()

const pendingCheckoutSchema = z
  .object({
    checkoutId: z.string().trim().min(1).optional(),
    idempotencyKey: z.string().trim().min(8),
    planId: z.enum(["starter", "growth", "scale"]),
    startedAt: z.number().finite().nonnegative(),
    status: z.string().trim().min(1),
    url: z
      .string()
      .url()
      .refine((value) => value.startsWith("https://"), {
        message: "Checkout redirects must use HTTPS.",
      })
      .optional(),
  })
  .strict()

export const onboardingDraftSchema = z
  .object({
    checkout: pendingCheckoutSchema.optional(),
    filteringContext: z.string().trim().max(1_000),
    filteringGuidelines: z.string().trim().max(1_000),
    keywords: z.array(onboardingKeywordDraftSchema).max(MAX_DRAFT_KEYWORDS),
    manualDescription: z.string().trim().max(1_000),
    selectedPlan: z.enum(["free", "starter", "growth", "scale"]).nullable(),
    step: onboardingStepSchema,
    version: z.literal(3),
    websiteUrl: z.string().trim().max(2_000),
    workspaceName: z.string().trim().max(160),
  })
  .strict()
  .superRefine((draft, context) => {
    const selectedPhrases = new Set<string>()
    for (const [index, keyword] of draft.keywords.entries()) {
      if (!keyword.selected) continue
      const normalized = normalizeKeywordPhrase(keyword.phrase)
      if (selectedPhrases.has(normalized)) {
        context.addIssue({
          code: "custom",
          message: "Selected keyword phrases must be unique.",
          path: ["keywords", index, "phrase"],
        })
      }
      selectedPhrases.add(normalized)
    }
  })

export type OnboardingDraft = z.infer<typeof onboardingDraftSchema>
export type OnboardingKeywordDraft = z.infer<
  typeof onboardingKeywordDraftSchema
>

const unusableCheckoutStatuses = new Set([
  "complete",
  "completed",
  "canceled",
  "cancelled",
  "expired",
])

export function canReuseOnboardingCheckout(
  checkout: NonNullable<OnboardingDraft["checkout"]>,
  now: number,
): boolean {
  const ageMs = now - checkout.startedAt
  return (
    Number.isSafeInteger(now) &&
    ageMs >= 0 &&
    ageMs < CHECKOUT_INTENT_TTL_MS &&
    !unusableCheckoutStatuses.has(checkout.status.toLocaleLowerCase("en"))
  )
}

export function createOnboardingDraft(workspaceName: string): OnboardingDraft {
  return {
    filteringContext: "",
    filteringGuidelines: "",
    keywords: [],
    manualDescription: "",
    selectedPlan: null,
    step: 1,
    version: 3,
    websiteUrl: "",
    workspaceName: workspaceName.trim(),
  }
}

export function normalizeKeywordPhrase(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en")
}

export function mergeResearchKeywordDrafts(
  existing: readonly OnboardingKeywordDraft[],
  suggestions: readonly OnboardingKeywordDraft[],
): OnboardingKeywordDraft[] {
  const custom = existing.filter(
    (keyword) => keyword.origin === "custom" && keyword.phrase.trim(),
  )
  const phrases = new Set(
    custom.map((keyword) => normalizeKeywordPhrase(keyword.phrase)),
  )
  const merged = [...custom]
  for (const suggestion of suggestions) {
    const phrase = normalizeKeywordPhrase(suggestion.phrase)
    if (!phrase || phrases.has(phrase) || merged.length >= MAX_DRAFT_KEYWORDS) continue
    phrases.add(phrase)
    merged.push(suggestion)
  }
  return merged
}

export function draftStorageKey(workspaceId: string): string {
  return `astreex:onboarding:${workspaceId}:v3`
}

export function clearOnboardingDraftStorage(
  storage: Pick<Storage, "removeItem">,
  workspaceId: string,
): void {
  try {
    storage.removeItem(draftStorageKey(workspaceId))
  } catch {
    // Storage cleanup must not block navigation or account deletion.
  }
}
