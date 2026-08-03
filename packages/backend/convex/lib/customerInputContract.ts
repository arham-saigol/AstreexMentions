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
