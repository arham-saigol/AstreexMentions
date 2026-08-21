import rateLimiterTest from "@convex-dev/rate-limiter/test"
import { convexTest } from "convex-test"
import { makeFunctionReference, type UserIdentity } from "convex/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import schema from "../convex/schema"
import { vertexServiceAccountJson } from "./fixtures/vertexServiceAccount"

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    readonly models = {
      generateContent: async () => {
        const next = (
          globalThis as { geminiTestResponses?: unknown[] }
        ).geminiTestResponses?.shift()
        if (next instanceof Error) throw next
        return { text: JSON.stringify(next) }
      },
    }
  },
  ThinkingLevel: { MEDIUM: "MEDIUM" },
}))

const modules = {
  "./_generated/server.ts": async () => ({}),
  "./lib/authorization.ts": async () =>
    await import("../convex/lib/authorization"),
  "./onboardingDiscovery.ts": async () =>
    await import("../convex/onboardingDiscovery"),
  "./onboardingResearchInternal.ts": async () =>
    await import("../convex/onboardingResearchInternal"),
  "./users.ts": async () => await import("../convex/users"),
}

const identity = {
  issuer: "https://clerk.example.test",
  subject: "onboarding-discovery-user",
  tokenIdentifier: "https://clerk.example.test|onboarding-discovery-user",
} satisfies Partial<UserIdentity>

const bootstrapCurrentUser = makeFunctionReference<"mutation">(
  "users:bootstrapCurrentUser",
)
const researchCompany = makeFunctionReference<
  "action",
  { manualDescription?: string; websiteUrl?: string },
  unknown
>("onboardingDiscovery:researchCompany")

const serviceAccountJson = vertexServiceAccountJson()

function createBackendTest() {
  const t = convexTest({ modules, schema })
  rateLimiterTest.register(t)
  return t
}

async function customer() {
  const t = createBackendTest()
  const client = t.withIdentity(identity)
  await client.mutation(bootstrapCurrentUser, {})
  return { client, t }
}

function configureProviders(): void {
  process.env.TINYFISH_API_KEY = "tinyfish-test-key"
  process.env.VERTEX_AI_PROJECT_ID = "astreex-test"
  process.env.VERTEX_AI_SERVICE_ACCOUNT_JSON = serviceAccountJson
}

const providerVariables = [
  "TINYFISH_API_KEY",
  "VERTEX_AI_PROJECT_ID",
  "VERTEX_AI_SERVICE_ACCOUNT_JSON",
] as const
let previousProviderVariables: Record<string, string | undefined>

beforeEach(() => {
  previousProviderVariables = Object.fromEntries(
    providerVariables.map((name) => [name, process.env[name]]),
  )
  delete (globalThis as { geminiTestResponses?: unknown[] }).geminiTestResponses
})

afterEach(() => {
  for (const name of providerVariables) {
    const value = previousProviderVariables[name]
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  vi.unstubAllGlobals()
})

describe("onboarding company discovery", () => {
  it("returns validated recommendations from both structured Gemini calls", async () => {
    configureProviders()
    ;(globalThis as { geminiTestResponses?: unknown[] }).geminiTestResponses = [
      { queries: ["Astreex social listening"] },
      {
        filteringContext: "Astreex helps teams monitor customer conversations.",
        filteringGuidelines:
          "Include product discussions. Exclude astronomy uses of Astreex.",
        suggestions: [
          {
            brandCandidate: true,
            description: "The primary product name.",
            phrase: "Astreex",
            platforms: ["x", "reddit"],
          },
        ],
      },
    ]
    const search = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          query: "Astreex social listening",
          results: [
            {
              position: 0,
              snippet: "Astreex is a social listening product.",
              title: "Astreex",
              url: "https://example.com/astreex",
            },
          ],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal("fetch", search)
    const { client } = await customer()

    await expect(
      client.action(researchCompany, {
        manualDescription: "Astreex monitors customer conversations.",
      }),
    ).resolves.toEqual({
      filteringContext: "Astreex helps teams monitor customer conversations.",
      filteringGuidelines:
        "Include product discussions. Exclude astronomy uses of Astreex.",
      state: "completed",
      suggestions: [
        {
          brandCandidate: true,
          description: "The primary product name.",
          phrase: "Astreex",
          platforms: ["x", "reddit"],
        },
      ],
    })
    expect(search).toHaveBeenCalledTimes(1)
  })

  it("does not persist a result when Gemini structured output is malformed", async () => {
    configureProviders()
    ;(globalThis as { geminiTestResponses?: unknown[] }).geminiTestResponses = [
      { queries: [""] },
    ]
    const { client, t } = await customer()

    await expect(
      client.action(researchCompany, {
        manualDescription: "Astreex monitors customer conversations.",
      }),
    ).resolves.toMatchObject({ retryable: true, state: "failed" })
    const research = await t.run(
      async (ctx) => await ctx.db.query("onboardingResearch").unique(),
    )
    expect(research).toMatchObject({
      errorCode: "RESEARCH_FAILED",
      status: "failed",
    })
    expect(research?.suggestionsJson).toBeUndefined()
    const run = await t.run(
      async (ctx) => await ctx.db.query("providerRuns").unique(),
    )
    expect(run).toMatchObject({
      errorCode: "RESEARCH_FAILED",
      provider: "gemini",
      status: "failed",
    })
  })

  it("returns a retryable customer-safe failure for a Gemini provider error", async () => {
    configureProviders()
    ;(globalThis as { geminiTestResponses?: unknown[] }).geminiTestResponses = [
      Object.assign(new Error("private Vertex failure"), { statusCode: 503 }),
    ]
    const { client, t } = await customer()

    await expect(
      client.action(researchCompany, {
        manualDescription: "Astreex monitors customer conversations.",
      }),
    ).resolves.toEqual({
      message:
        "Company research returned invalid data. Retry or add keywords manually.",
      retryable: true,
      state: "failed",
    })
    const run = await t.run(
      async (ctx) => await ctx.db.query("providerRuns").unique(),
    )
    expect(run).toMatchObject({
      errorCode: "SERVER_ERROR",
      provider: "gemini",
      status: "failed",
    })
    const bucket = await t.run(
      async (ctx) =>
        await ctx.db
          .query("providerMetricBuckets")
          .withIndex("by_provider_operation_granularity_and_bucket", (q) =>
            q.eq("provider", "gemini").eq("operation", "onboarding.research"),
          )
          .first(),
    )
    expect(bucket).toMatchObject({
      failureCount: 1,
      provider: "gemini",
      successCount: 0,
    })
  })

  it("resets provider attribution to tinyfish when retrying after a Gemini failure and succeeding", async () => {
    configureProviders()
    ;(globalThis as { geminiTestResponses?: unknown[] }).geminiTestResponses = [
      Object.assign(new Error("private Vertex failure"), { statusCode: 503 }),
    ]
    const { client, t } = await customer()

    await expect(
      client.action(researchCompany, {
        manualDescription: "Astreex monitors customer conversations.",
      }),
    ).resolves.toMatchObject({ retryable: true, state: "failed" })

    const failedRun = await t.run(
      async (ctx) => await ctx.db.query("providerRuns").unique(),
    )
    expect(failedRun).toMatchObject({
      provider: "gemini",
      status: "failed",
    })

    ;(globalThis as { geminiTestResponses?: unknown[] }).geminiTestResponses = [
      { queries: ["Astreex social listening"] },
      {
        filteringContext: "Astreex helps teams monitor customer conversations.",
        filteringGuidelines:
          "Include product discussions. Exclude astronomy uses of Astreex.",
        suggestions: [
          {
            brandCandidate: true,
            description: "The primary product name.",
            phrase: "Astreex",
            platforms: ["x", "reddit"],
          },
        ],
      },
    ]
    const search = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          query: "Astreex social listening",
          results: [
            {
              position: 0,
              snippet: "Astreex is a social listening product.",
              title: "Astreex",
              url: "https://example.com/astreex",
            },
          ],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal("fetch", search)

    await expect(
      client.action(researchCompany, {
        manualDescription: "Astreex monitors customer conversations.",
      }),
    ).resolves.toMatchObject({ state: "completed" })

    const succeededRun = await t.run(
      async (ctx) => await ctx.db.query("providerRuns").unique(),
    )
    expect(succeededRun).toMatchObject({
      attempt: 2,
      provider: "tinyfish",
      status: "succeeded",
    })
    const tinyfishBucket = await t.run(
      async (ctx) =>
        await ctx.db
          .query("providerMetricBuckets")
          .withIndex("by_provider_operation_granularity_and_bucket", (q) =>
            q.eq("provider", "tinyfish").eq("operation", "onboarding.research"),
          )
          .first(),
    )
    expect(tinyfishBucket).toMatchObject({
      provider: "tinyfish",
      retryCount: 1,
      successCount: 1,
    })
  })

  it("requires both TinyFish and Vertex configuration before research starts", async () => {
    const { client, t } = await customer()

    await expect(
      client.action(researchCompany, {
        manualDescription: "Astreex monitors customer conversations.",
      }),
    ).resolves.toEqual({
      message:
        "Company research is temporarily unavailable. You can retry or add keywords manually.",
      state: "provider_unconfigured",
    })
    await expect(
      t.run(async (ctx) => await ctx.db.query("onboardingResearch").unique()),
    ).resolves.toBeNull()
  })
})
