import { readdirSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { PUBLIC_FUNCTION_AUTHORIZATION_INVENTORY } from "../convex/lib/publicFunctionAuthorizationInventory"

const convexDirectory = fileURLToPath(new URL("../convex/", import.meta.url))

function typescriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`
    return entry.isDirectory()
      ? typescriptFiles(path)
      : entry.name.endsWith(".ts")
        ? [path]
        : []
  })
}

function discoveredPublicFunctions(): Record<string, string> {
  const pattern =
    /export\s+const\s+([A-Za-z][A-Za-z0-9_]*)\s*=\s*(adminAction|adminMutation|adminQuery|authenticatedAction|authenticatedMutation|authenticatedQuery|customerAction|customerMutation|customerQuery|httpAction|publicQuery)\s*\(/gu
  const discovered: Record<string, string> = {}
  for (const path of typescriptFiles(convexDirectory)) {
    const modulePath = path
      .slice(convexDirectory.length + 1, -3)
      .replaceAll("\\", "/")
    for (const match of readFileSync(path, "utf8").matchAll(pattern)) {
      discovered[`${modulePath}:${match[1]!}`] = match[2]!
    }
  }
  return discovered
}

describe("public authorization inventory", () => {
  it("inventories every public function with its actual wrapper", () => {
    expect(discoveredPublicFunctions()).toEqual(
      Object.fromEntries(
        Object.entries(PUBLIC_FUNCTION_AUTHORIZATION_INVENTORY).map(
          ([reference, entry]) => [reference, entry.wrapper],
        ),
      ),
    )
  })

  it("derives customer tenants, exact-checks admins, and verifies providers", () => {
    const authorization = readFileSync(
      `${convexDirectory}/lib/authorization.ts`,
      "utf8",
    )
    expect(authorization).toContain("resolveCurrentCustomerAuthorization")
    expect(authorization).toContain(
      "assertAdminClerkUserId(identity.subject, env.ADMIN_CLERK_USER_ID)",
    )
    expect(
      readFileSync(`${convexDirectory}/billing/creemHttp.ts`, "utf8"),
    ).toContain('request.headers.get("creem-signature")')
    expect(
      readFileSync(`${convexDirectory}/email/resendHttp.ts`, "utf8"),
    ).toContain('request.headers.get("svix-signature")')
  })
})
