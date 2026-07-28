import { describe, expect, it } from "vitest"

import {
  featureRequestCreateResultSchema,
  featureRequestInputSchema,
} from "./feature-requests"

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

  it("accepts supported mutation confirmations and strips other fields", () => {
    expect(featureRequestCreateResultSchema.parse("request_1")).toEqual({
      id: "request_1",
    })
    expect(
      featureRequestCreateResultSchema.parse({
        featureRequestId: "request_2",
        status: "new",
        adminNote: "internal-only",
      }),
    ).toEqual({ id: "request_2" })
  })

  it("rejects mutation results without a request id", () => {
    expect(
      featureRequestCreateResultSchema.safeParse({ status: "new" }).success,
    ).toBe(false)
  })
})
