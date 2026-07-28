import { z } from "zod"

export const DEFAULT_CLERK_TIMEOUT_MS = 15_000
const CLERK_API_BASE_URL = "https://api.clerk.com/v1"

const nonEmptyStringSchema = z.string().trim().min(1)
const positiveTimeoutSchema = z.number().finite().positive()
const clerkUserSchema = z.object({ id: nonEmptyStringSchema }).passthrough()

export class ClerkIntegrationError extends Error {
  readonly code: string
  readonly retryable: boolean
  readonly status?: number

  constructor(
    code: string,
    message: string,
    options: {
      cause?: unknown
      retryable?: boolean
      status?: number
    } = {},
  ) {
    super(
      message,
      options.cause === undefined ? undefined : { cause: options.cause },
    )
    this.name = "ClerkIntegrationError"
    this.code = code
    this.retryable = options.retryable ?? false
    if (options.status !== undefined) {
      this.status = options.status
    }
  }
}

export type ClerkAdminClient = {
  deleteUser(clerkUserId: string): Promise<"absent" | "deleted">
  getUserState(clerkUserId: string): Promise<"absent" | "present">
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500
}

export function createClerkAdminClient(options: {
  fetch?: typeof fetch
  secretKey: string
  timeoutMs?: number
}): ClerkAdminClient {
  const secretKey = nonEmptyStringSchema.safeParse(options.secretKey)
  const timeoutMs = positiveTimeoutSchema.safeParse(
    options.timeoutMs ?? DEFAULT_CLERK_TIMEOUT_MS,
  )
  if (!secretKey.success || !timeoutMs.success) {
    throw new ClerkIntegrationError(
      "INVALID_CONFIGURATION",
      "Clerk deletion client configuration is invalid",
    )
  }

  const fetchImplementation = options.fetch ?? fetch

  const request = async (
    method: "DELETE" | "GET",
    clerkUserId: string,
  ): Promise<Response | null> => {
    const userId = nonEmptyStringSchema.safeParse(clerkUserId)
    if (!userId.success) {
      throw new ClerkIntegrationError(
        "INVALID_INPUT",
        "Clerk user id is invalid",
      )
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs.data)
    let response: Response
    try {
      response = await fetchImplementation(
        `${CLERK_API_BASE_URL}/users/${encodeURIComponent(userId.data)}`,
        {
          method,
          headers: {
            Authorization: `Bearer ${secretKey.data}`,
            "Content-Type": "application/json",
          },
          signal: controller.signal,
        },
      )
    } catch (error) {
      if (controller.signal.aborted) {
        throw new ClerkIntegrationError(
          "REQUEST_TIMEOUT",
          "Clerk request timed out",
          { cause: error, retryable: true },
        )
      }
      throw new ClerkIntegrationError(
        "REQUEST_FAILED",
        "Clerk request failed",
        { cause: error, retryable: true },
      )
    } finally {
      clearTimeout(timeout)
    }

    if (response.status === 404) {
      return null
    }
    if (!response.ok) {
      throw new ClerkIntegrationError(
        `HTTP_${response.status}`,
        `Clerk returned HTTP ${response.status}`,
        {
          retryable: isRetryableStatus(response.status),
          status: response.status,
        },
      )
    }
    return response
  }

  return {
    deleteUser: async (clerkUserId) => {
      const response = await request("DELETE", clerkUserId)
      return response === null ? "absent" : "deleted"
    },
    getUserState: async (clerkUserId) => {
      const response = await request("GET", clerkUserId)
      if (response === null) {
        return "absent"
      }

      let body: unknown
      try {
        body = (await response.json()) as unknown
      } catch (error) {
        throw new ClerkIntegrationError(
          "INVALID_RESPONSE",
          "Clerk returned invalid JSON",
          { cause: error },
        )
      }
      if (!clerkUserSchema.safeParse(body).success) {
        throw new ClerkIntegrationError(
          "INVALID_RESPONSE",
          "Clerk returned an invalid user response",
        )
      }
      return "present"
    },
  }
}
