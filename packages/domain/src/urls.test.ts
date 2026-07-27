import { describe, expect, it } from "vitest"

import {
  canonicalizeMentionUrl,
  createMentionDedupeKey,
  detectPlatformFromUrl,
  extractProviderContentId,
} from "./index"

describe("canonical mention URLs", () => {
  it("normalizes X hosts, paths, and tracking data", () => {
    const first =
      "http://twitter.com/Astreex/status/123456?s=20&utm_source=test#reply"
    const mobile = "https://mobile.twitter.com/Astreex/status/123456"
    const second = "https://x.com/i/web/status/123456"
    expect(canonicalizeMentionUrl(first)).toBe(second)
    expect(canonicalizeMentionUrl(mobile)).toBe(second)
    expect(extractProviderContentId(first)).toBe("123456")
    expect(detectPlatformFromUrl(mobile)).toBe("x")
    expect(createMentionDedupeKey({ platform: "x", url: first })).toBe(
      createMentionDedupeKey({ platform: "x", url: second }),
    )
  })

  it("normalizes Reddit post variants independently of slugs", () => {
    const full =
      "https://old.reddit.com/r/TypeScript/comments/AbC123/a_title/comment?utm_medium=social"
    const short = "https://redd.it/abc123"
    expect(canonicalizeMentionUrl(full)).toBe(
      "https://www.reddit.com/r/typescript/comments/abc123",
    )
    expect(canonicalizeMentionUrl(short)).toBe(
      "https://www.reddit.com/comments/abc123",
    )
    expect(createMentionDedupeKey({ platform: "reddit", url: full })).toBe(
      "reddit:abc123",
    )
    expect(createMentionDedupeKey({ platform: "reddit", url: short })).toBe(
      "reddit:abc123",
    )
  })

  it("normalizes Hacker News item links", () => {
    const url = "http://news.ycombinator.com/item?id=4242&utm_source=email#top"
    expect(canonicalizeMentionUrl(url)).toBe(
      "https://news.ycombinator.com/item?id=4242",
    )
    expect(extractProviderContentId(url, "hacker_news")).toBe("4242")
    expect(createMentionDedupeKey({ platform: "hacker_news", url })).toBe(
      "hacker_news:4242",
    )
  })

  it("canonicalizes generic URLs for fallback dedupe keys", () => {
    const url =
      "http://Example.com:80/path//to/page/?b=2&utm_source=x&a=1#section"
    expect(canonicalizeMentionUrl(url)).toBe(
      "https://example.com/path/to/page?a=1&b=2",
    )

    const misleadingProviderPath = "https://example.com/user/status/123"
    expect(
      extractProviderContentId(misleadingProviderPath, "x"),
    ).toBeUndefined()
    expect(canonicalizeMentionUrl(misleadingProviderPath, "x")).toBe(
      misleadingProviderPath,
    )
    expect(
      createMentionDedupeKey({
        platform: "x",
        url: misleadingProviderPath,
      }),
    ).toBe(`x:url:${misleadingProviderPath}`)
    expect(
      createMentionDedupeKey({
        platform: "x",
        providerId: " provider-7 ",
        url: "https://example.com/post",
      }),
    ).toBe("x:provider-7")
    expect(
      createMentionDedupeKey({
        platform: "x",
        url: "https://example.com/post/?utm_campaign=test",
      }),
    ).toBe("x:url:https://example.com/post")
  })

  it("rejects unsafe or malformed URL inputs", () => {
    expect(() => canonicalizeMentionUrl("not a url")).toThrow(TypeError)
    expect(() => canonicalizeMentionUrl("javascript:alert(1)")).toThrow(
      TypeError,
    )
    expect(() =>
      canonicalizeMentionUrl("https://user:pass@example.com"),
    ).toThrow(TypeError)
  })
})
