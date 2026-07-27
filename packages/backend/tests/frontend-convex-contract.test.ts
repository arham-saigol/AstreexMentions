import { readdirSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { PUBLIC_FUNCTION_AUTHORIZATION_INVENTORY } from "../convex/lib/publicFunctionAuthorizationInventory"

const backendConvexDirectory = fileURLToPath(
  new URL("../convex/", import.meta.url),
)
const frontendReferenceFiles = [
  fileURLToPath(
    new URL("../../../apps/web/lib/customer-convex.ts", import.meta.url),
  ),
  fileURLToPath(
    new URL("../../../apps/web/lib/onboarding-convex.ts", import.meta.url),
  ),
  fileURLToPath(new URL("../../../apps/web/lib/changelog.ts", import.meta.url)),
  fileURLToPath(
    new URL("../../../apps/admin/lib/convex-references.ts", import.meta.url),
  ),
]

const FRONTEND_ARGUMENT_KEYS = {
  "admin:cancelDeletionJob": ["confirmation", "deletionJobId"],
  "admin:createChangelogEntry": [
    "body",
    "label",
    "publishedAt",
    "slug",
    "summary",
    "title",
  ],
  "admin:deleteChangelogEntry": ["entryId"],
  "admin:getDeletionJob": ["deletionJobId"],
  "admin:getMetricsOverview": ["days"],
  "admin:listChangelogEntries": ["status"],
  "admin:listFeatureRequests": ["status"],
  "admin:listDeletionJobs": ["limit", "status"],
  "admin:publishChangelogEntry": ["entryId"],
  "admin:retryDeletionJob": ["confirmation", "deletionJobId"],
  "admin:unpublishChangelogEntry": ["entryId"],
  "admin:updateChangelogEntry": [
    "body",
    "entryId",
    "label",
    "publishedAt",
    "slug",
    "summary",
    "title",
  ],
  "admin:updateFeatureRequest": ["adminNote", "requestId", "status"],
  "billing/customer:createBillingPortal": [],
  "billing/customer:createCheckout": ["idempotencyKey", "planId"],
  "billing/customer:getBillingOverview": [],
  "billing/customer:upgradeSubscription": ["planId"],
  "categories:createCategory": ["colorToken", "description", "name"],
  "categories:deleteCategory": ["categoryId"],
  "categories:listCategories": [],
  "categories:updateCategory": [
    "categoryId",
    "colorToken",
    "description",
    "enabled",
    "name",
  ],
  "changelog:listPublishedEntries": [],
  "featureRequests:createFeatureRequest": ["description", "title"],
  "featureRequests:listMyFeatureRequests": [],
  "keywords:createKeyword": ["phrase", "platforms"],
  "keywords:deleteKeyword": ["keywordId"],
  "keywords:getKeywordSummary": [],
  "keywords:listKeywords": [],
  "keywords:pauseKeyword": ["keywordId"],
  "keywords:resumeKeyword": ["keywordId"],
  "keywords:updateKeyword": ["keywordId", "phrase", "platforms"],
  "mentions:getMention": ["mentionId"],
  "mentions:listMentions": ["cursor", "filters", "limit", "query", "sort"],
  "mentions:updateMentionStatus": ["mentionId", "status"],
  "savedViews:createSavedView": ["filters", "icon", "name", "sort"],
  "savedViews:deleteSavedView": ["savedViewId"],
  "savedViews:listSavedViews": [],
  "savedViews:reorderSavedViews": ["savedViewIds"],
  "savedViews:updateSavedView": [
    "filters",
    "icon",
    "name",
    "savedViewId",
    "sort",
  ],
  "settings:getSettings": [],
  "settings:updateDigestPreferences": [
    "enabled",
    "hour",
    "mentionLimit",
    "minute",
    "timeZone",
  ],
  "users:bootstrapCurrentUser": [],
  "users:getCurrentUser": [],
  "users:updateCurrentUser": ["imageUrl", "name"],
  "workspaces:deleteAccount": ["confirmation"],
  "workspaces:getAccountDeletionReadiness": [],
  "workspaces:getAccountDeletionStatus": [],
  "workspaces:getCurrentWorkspace": [],
  "workspaces:updateCurrentWorkspace": ["name"],
} as const

function typescriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`
    if (entry.isDirectory()) {
      return typescriptFiles(path)
    }
    return entry.name.endsWith(".ts") ? [path] : []
  })
}

function frontendFunctionReferences(): string[] {
  const referencePattern = /"([A-Za-z][A-Za-z0-9_/-]*:[A-Za-z][A-Za-z0-9_]*)"/gu
  return [
    ...new Set(
      frontendReferenceFiles.flatMap((path) =>
        [...readFileSync(path, "utf8").matchAll(referencePattern)].map(
          (match) => match[1]!,
        ),
      ),
    ),
  ].sort()
}

function functionSource(reference: string): string {
  const [modulePath, functionName] = reference.split(":") as [string, string]
  const source = readFileSync(
    `${backendConvexDirectory}/${modulePath}.ts`,
    "utf8",
  )
  const start = source.search(
    new RegExp(`export\\s+const\\s+${functionName}\\s*=`, "u"),
  )
  expect(start, `missing backend export ${reference}`).toBeGreaterThanOrEqual(0)
  const next = source.indexOf("\nexport const ", start + 1)
  return source.slice(start, next === -1 ? source.length : next)
}

function argumentKeys(block: string): string[] {
  const marker = block.indexOf("args:")
  expect(marker).toBeGreaterThanOrEqual(0)
  const objectStart = block.indexOf("{", marker)
  expect(objectStart).toBeGreaterThanOrEqual(0)

  let depth = 0
  let objectEnd = -1
  for (let index = objectStart; index < block.length; index += 1) {
    if (block[index] === "{") {
      depth += 1
    } else if (block[index] === "}") {
      depth -= 1
      if (depth === 0) {
        objectEnd = index
        break
      }
    }
  }
  expect(objectEnd).toBeGreaterThan(objectStart)

  const body = block.slice(objectStart + 1, objectEnd)
  if (body.trim().length === 0) {
    return []
  }
  if (!body.includes("\n")) {
    return [...body.matchAll(/([A-Za-z][A-Za-z0-9_]*):/gu)].map(
      (match) => match[1]!,
    )
  }
  return [...body.matchAll(/^    ([A-Za-z][A-Za-z0-9_]*):/gmu)].map(
    (match) => match[1]!,
  )
}

function discoveredPublicFunctions(): Record<string, string> {
  const wrapperPattern =
    /export\s+const\s+([A-Za-z][A-Za-z0-9_]*)\s*=\s*(adminAction|adminMutation|adminQuery|authenticatedAction|authenticatedMutation|authenticatedQuery|customerAction|customerMutation|customerQuery|httpAction|publicQuery)\s*\(/gu
  const discovered: Record<string, string> = {}

  for (const path of typescriptFiles(backendConvexDirectory)) {
    const modulePath = path
      .slice(backendConvexDirectory.length + 1, -3)
      .replaceAll("\\", "/")
    const source = readFileSync(path, "utf8")
    for (const match of source.matchAll(wrapperPattern)) {
      discovered[`${modulePath}:${match[1]!}`] = match[2]!
    }
  }

  return discovered
}

describe("frontend Convex contract and public authorization inventory", () => {
  it("matches every frontend generic reference name and argument shape", () => {
    const frontendReferences = frontendFunctionReferences()
    expect(frontendReferences).toEqual(
      Object.keys(FRONTEND_ARGUMENT_KEYS).sort(),
    )

    for (const reference of frontendReferences) {
      const block = functionSource(reference)
      expect(argumentKeys(block).sort(), reference).toEqual(
        [
          ...FRONTEND_ARGUMENT_KEYS[
            reference as keyof typeof FRONTEND_ARGUMENT_KEYS
          ],
        ].sort(),
      )
      expect(block, `${reference} lacks a runtime return validator`).toContain(
        "returns:",
      )
      expect(
        PUBLIC_FUNCTION_AUTHORIZATION_INVENTORY,
        `${reference} lacks an authorization inventory entry`,
      ).toHaveProperty(reference)
    }
  })

  it("inventories every public function with its actual wrapper", () => {
    const discovered = discoveredPublicFunctions()
    const inventoryWrappers = Object.fromEntries(
      Object.entries(PUBLIC_FUNCTION_AUTHORIZATION_INVENTORY).map(
        ([reference, entry]) => [reference, entry.wrapper],
      ),
    )

    expect(discovered).toEqual(inventoryWrappers)
  })

  it("derives customer tenants, exact-checks admins, and verifies providers", () => {
    const authorizationSource = readFileSync(
      `${backendConvexDirectory}/lib/authorization.ts`,
      "utf8",
    )
    expect(authorizationSource).toContain("resolveCurrentCustomerAuthorization")
    expect(authorizationSource).not.toContain(
      "export const customerQuery = customQuery(query, {\n  args: { workspaceId:",
    )
    expect(authorizationSource).toContain(
      "assertAdminClerkUserId(identity.subject, env.ADMIN_CLERK_USER_ID)",
    )

    const creemSource = readFileSync(
      `${backendConvexDirectory}/billing/creemHttp.ts`,
      "utf8",
    )
    expect(creemSource).toContain("verifyCreemWebhookSignature")
    expect(creemSource).toContain('request.headers.get("creem-signature")')

    const resendSource = readFileSync(
      `${backendConvexDirectory}/email/resendHttp.ts`,
      "utf8",
    )
    expect(resendSource).toContain("verifyResendEmailWebhook")
    expect(resendSource).toContain('request.headers.get("svix-signature")')
  })
})
