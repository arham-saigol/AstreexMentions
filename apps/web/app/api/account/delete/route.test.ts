import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  deleteCurrentAccount,
  type AccountDeletionResult,
} from "@/lib/account-deletion"

import { POST } from "./route"

vi.mock("@/lib/account-deletion", () => ({
  deleteCurrentAccount: vi.fn(),
}))

const deleteCurrentAccountMock = vi.mocked(deleteCurrentAccount)
const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL
const previousSiteUrl = process.env.NEXT_PUBLIC_SITE_URL

function request(
  body: unknown,
  origin: string | null = "http://localhost:3000",
) {
  return new NextRequest("http://localhost:3000/api/account/delete", {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      ...(origin === null ? {} : { Origin: origin }),
    },
    method: "POST",
  })
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000"
  delete process.env.NEXT_PUBLIC_SITE_URL
  deleteCurrentAccountMock.mockReset()
})

afterEach(() => {
  if (previousAppUrl === undefined) {
    delete process.env.NEXT_PUBLIC_APP_URL
  } else {
    process.env.NEXT_PUBLIC_APP_URL = previousAppUrl
  }
  if (previousSiteUrl === undefined) {
    delete process.env.NEXT_PUBLIC_SITE_URL
  } else {
    process.env.NEXT_PUBLIC_SITE_URL = previousSiteUrl
  }
})

describe("account deletion HTTP route", () => {
  it("fails closed when the canonical origin is missing", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    const response = await POST(request({ confirmation: "DELETE" }))

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({
      code: "ORIGIN_CONFIGURATION_REQUIRED",
      deleted: false,
    })
    expect(deleteCurrentAccountMock).not.toHaveBeenCalled()
  })

  it.each([
    ["cross-origin", "https://attacker.example"],
    ["missing-origin", null],
  ])("rejects %s destructive requests", async (_label, origin) => {
    const response = await POST(request({ confirmation: "DELETE" }, origin))

    expect(response.status).toBe(403)
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    await expect(response.json()).resolves.toMatchObject({
      code: "ORIGIN_REJECTED",
      deleted: false,
    })
    expect(deleteCurrentAccountMock).not.toHaveBeenCalled()
  })

  it("requires the exact destructive confirmation", async () => {
    const response = await POST(request({ confirmation: "delete" }))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      code: "INVALID_CONFIRMATION",
      deleted: false,
    })
    expect(deleteCurrentAccountMock).not.toHaveBeenCalled()
  })

  it.each([
    {
      result: {
        code: "ACCOUNT_DELETION_ACCEPTED",
        deleted: false as const,
        deletionJobId: "job_accepted",
        message: "Accepted",
        state: "accepted" as const,
        status: 202 as const,
      },
      status: 202,
    },
    {
      result: {
        code: "ACCOUNT_DELETION_IN_PROGRESS",
        deleted: false as const,
        deletionJobId: "job_running",
        message: "Running",
        state: "in_progress" as const,
        status: 202 as const,
      },
      status: 202,
    },
    {
      result: {
        code: "BILLING_PORTAL_REQUIRED",
        deleted: false as const,
        deletionJobId: "job_blocked",
        message: "Cancel billing",
        state: "portal_required" as const,
        status: 409 as const,
      },
      status: 409,
    },
    {
      result: {
        code: "BILLING_CONFIGURATION_REQUIRED",
        deleted: false as const,
        message: "Support required",
        state: "support_required" as const,
        status: 503 as const,
      },
      status: 503,
    },
  ] satisfies Array<{ result: AccountDeletionResult; status: number }>)(
    "preserves the durable backend response with HTTP $status",
    async ({ result, status }) => {
      deleteCurrentAccountMock.mockResolvedValueOnce(result)
      const response = await POST(request({ confirmation: "DELETE" }))

      expect(response.status).toBe(status)
      expect(response.headers.get("Cache-Control")).toBe("no-store")
      await expect(response.json()).resolves.toEqual(
        expect.objectContaining({
          code: result.code,
          deleted: false,
        }),
      )
      expect(deleteCurrentAccountMock).toHaveBeenCalledWith("DELETE")
    },
  )
})
