export const KEYWORD_PLATFORMS = ["x", "reddit", "hacker_news"] as const
export type KeywordPlatform = (typeof KEYWORD_PLATFORMS)[number]

export function validateKeywordPlatforms(
  values: readonly unknown[],
): KeywordPlatform[] {
  if (!Array.isArray(values) || values.length === 0) {
    throw new TypeError("Select at least one keyword platform")
  }

  const seen = new Set<KeywordPlatform>()
  const platforms: KeywordPlatform[] = []
  for (const value of values) {
    if (
      typeof value !== "string" ||
      !(KEYWORD_PLATFORMS as readonly string[]).includes(value)
    ) {
      throw new TypeError("Keyword platform is not supported")
    }
    const platform = value as KeywordPlatform
    if (seen.has(platform)) {
      throw new TypeError("Keyword platforms cannot contain duplicates")
    }
    seen.add(platform)
    platforms.push(platform)
  }
  return platforms
}

export const SYNTHETIC_ALL_MENTIONS_VIEW_NAME = "All Mentions"

export function normalizeSavedViewName(name: string): string {
  return name.trim().toLocaleLowerCase("en")
}

/** All Mentions is rendered synthetically and never receives a stored row. */
export function assertPersistableSavedViewName(name: string): string {
  const trimmed = name.trim()
  const normalized = normalizeSavedViewName(trimmed)
  if (normalized.length === 0) {
    throw new TypeError("Saved view name must be a non-empty string")
  }
  if (normalized === normalizeSavedViewName(SYNTHETIC_ALL_MENTIONS_VIEW_NAME)) {
    throw new TypeError("All Mentions is a synthetic view and cannot be stored")
  }
  return trimmed
}
