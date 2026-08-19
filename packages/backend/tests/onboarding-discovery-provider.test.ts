import { describe, expect, it, vi } from "vitest"

import {
  canonicalResearchUrl,
  createTinyFishClient,
  MAX_TINYFISH_PAGE_CHARS,
  TinyFishIntegrationError,
} from "../convex/integrations/tinyfish"

describe("TinyFish onboarding provider boundary", () => {
  it("rejects credentials, localhost, private IPs, and non-HTTP input", () => {
    for (const value of [
      "javascript:alert(1)",
      "ftp://example.com",
      "https://user:secret@example.com",
      "http://localhost:3000",
      "http://127.0.0.1",
      "http://169.254.169.254/latest/meta-data",
      "http://10.0.0.1",
      "http://[::ffff:127.0.0.1]",
      "http://[febf::1]",
    ]) {
      expect(() => canonicalResearchUrl(value)).toThrow(
        TinyFishIntegrationError,
      )
    }
    expect(canonicalResearchUrl(" https://example.com/about#team ")).toBe(
      "https://example.com/about",
    )
    expect(canonicalResearchUrl("example.com/about")).toBe(
      "https://example.com/about",
    )
  })

  it("uses X-API-Key, bounded Fetch input, and truncates remote page material", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          errors: [],
          results: [
            {
              final_url: "https://example.com/",
              format: "markdown",
              text: "x".repeat(MAX_TINYFISH_PAGE_CHARS + 100),
              url: "https://example.com/",
            },
          ],
        }),
        { status: 200 },
      ),
    )
    const client = createTinyFishClient({ apiKey: "secret", fetch })
    const result = await client.fetchMarkdown(
      ["https://example.com"],
      "Understand the company",
    )

    expect(result[0]).toHaveLength(MAX_TINYFISH_PAGE_CHARS)
    const [, init] = fetch.mock.calls[0]!
    expect(new Headers(init?.headers).get("X-API-Key")).toBe("secret")
    expect(JSON.parse(String(init?.body))).toMatchObject({
      format: "markdown",
      urls: ["https://example.com/"],
    })
  })

  it("rejects malformed Fetch and Search responses before model use", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(
        async () =>
          new Response(JSON.stringify({ results: [{}] }), { status: 200 }),
      )
    const client = createTinyFishClient({ apiKey: "secret", fetch })

    await expect(
      client.fetchMarkdown(["https://example.com"], "Research"),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" })
    await expect(
      client.search("example competitor", "Research"),
    ).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    })
  })
})
