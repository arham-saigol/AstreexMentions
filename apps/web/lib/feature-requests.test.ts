import { describe, expect, it } from "vitest"

import { featureRequestInputSchema } from "./feature-requests"

describe("feature request contracts", () => {
  it("normalizes customer input before submission", () => {
    expect(
      featureRequestInputSchema.parse({
        title: "  Saved   keyword groups  ",
        description: "  Let me group related keywords for focused review.  ",
      }),
    ).toEqual({
      title: "Saved keyword groups",
      description: "Let me group related keywords for focused review.",
    })
  })

  it("rejects incomplete customer input", () => {
    const result = featureRequestInputSchema.safeParse({
      title: " ",
      description: "Too short",
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.title?.[0]).toBeTruthy()
      expect(result.error.flatten().fieldErrors.description?.[0]).toBeTruthy()
    }
  })
})
