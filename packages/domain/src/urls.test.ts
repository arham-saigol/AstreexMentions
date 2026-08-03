import { describe, expect, it } from "vitest"

import { canonicalizeMentionUrl } from "./index"

describe("canonical mention URLs", () => {
  it("normalizes provider and generic URLs", () => {
    expect(
      canonicalizeMentionUrl(
        "http://twitter.com/Astreex/status/123456?s=20&utm_source=test#reply",
      ),
    ).toBe("https://x.com/i/web/status/123456")
    expect(canonicalizeMentionUrl("https://redd.it/AbC123")).toBe(
      "https://www.reddit.com/comments/abc123",
    )
    expect(
      canonicalizeMentionUrl(
        "http://Example.com:80/path//to/page/?b=2&utm_source=x&a=1#section",
      ),
    ).toBe("https://example.com/path/to/page?a=1&b=2")
  })

  it("rejects unsafe inputs", () => {
    expect(() => canonicalizeMentionUrl("not a url")).toThrow(TypeError)
    expect(() => canonicalizeMentionUrl("javascript:alert(1)")).toThrow(
      TypeError,
    )
  })
})
