import { describe, expect, it } from "vitest"

import { isPublicationDate, sanitizeChangelogPreview } from "./changelog"

describe("sanitizeChangelogPreview", () => {
  it("removes executable markup and HTML tags", () => {
    expect(
      sanitizeChangelogPreview(
        "<h1>Update</h1>\n<script>alert('x')</script><p>Safe copy</p>",
      ),
    ).toBe("Update\nSafe copy")
  })

  it("normalizes line endings and unsafe control characters", () => {
    const unsafeText = `First\r\nSecond${String.fromCharCode(0)}  \rThird`
    expect(sanitizeChangelogPreview(unsafeText)).toBe("First\nSecond\nThird")
  })
})

describe("publication date helpers", () => {
  it("accepts only real ISO calendar dates", () => {
    expect(isPublicationDate("2026-07-26")).toBe(true)
    expect(isPublicationDate("2026-02-30")).toBe(false)
    expect(isPublicationDate("07/26/2026")).toBe(false)
  })
})
