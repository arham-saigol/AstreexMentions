import { describe, expect, it } from "vitest"

import { accountDeletionResponseSchema } from "./settings-convex"

describe("settings account deletion states", () => {
  it("accepts request acknowledgement but never a completed-erasure claim", () => {
    expect(
      accountDeletionResponseSchema.safeParse({
        code: "ACCOUNT_DELETION_ACCEPTED",
        deleted: false,
        deletionJobId: "job_accepted",
        message: "Accepted.",
        state: "accepted",
      }).success,
    ).toBe(true)
    expect(
      accountDeletionResponseSchema.safeParse({
        code: "ACCOUNT_DELETION_ACCEPTED",
        deleted: true,
        deletionJobId: "job_accepted",
        message: "Deleted.",
        state: "accepted",
      }).success,
    ).toBe(false)
  })
})
