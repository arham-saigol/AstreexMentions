const htmlBlockPattern = /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi
const htmlCommentPattern = /<!--[\s\S]*?-->/g
const htmlTagPattern = /<\/?[a-z][^>]*>/gi

function removeUnsafeControlCharacters(value: string): string {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0
    const allowedWhitespace =
      codePoint === 9 || codePoint === 10 || codePoint === 13
    return allowedWhitespace || (codePoint >= 32 && codePoint !== 127)
      ? character
      : ""
  }).join("")
}

export function sanitizeChangelogPreview(value: string): string {
  return removeUnsafeControlCharacters(value)
    .replace(/\r\n?/g, "\n")
    .replace(htmlBlockPattern, "")
    .replace(htmlCommentPattern, "")
    .replace(htmlTagPattern, "")
    .split("\n")
    .map((line) => line.replace(/[\t ]+$/g, ""))
    .join("\n")
    .trim()
}

export function isPublicationDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }

  const date = new Date(`${value}T00:00:00.000Z`)
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  )
}

export function publicationDateToTimestamp(value: string): number {
  return new Date(`${value}T00:00:00.000Z`).getTime()
}

export function timestampToPublicationDate(timestamp?: number): string {
  if (timestamp === undefined) {
    return ""
  }

  const date = new Date(timestamp)
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10)
}

export function currentPublicationDate(): string {
  return new Date().toISOString().slice(0, 10)
}
