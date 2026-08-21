import { describe, expect, it, vi } from "vitest"

const { googleGenAiOptions } = vi.hoisted(() => ({
  googleGenAiOptions: [] as unknown[],
}))

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    readonly models = { generateContent: async () => ({ text: "{}" }) }

    constructor(options: unknown) {
      googleGenAiOptions.push(options)
    }
  },
  ThinkingLevel: { MEDIUM: "MEDIUM" },
}))

import {
  createGeminiJsonRequester,
  GeminiIntegrationError,
  readGeminiRuntimeConfiguration,
} from "../convex/integrations/gemini"
import { vertexServiceAccountJson } from "./fixtures/vertexServiceAccount"

function configuredGemini() {
  const configuration = readGeminiRuntimeConfiguration({
    VERTEX_AI_PROJECT_ID: "astreex-test",
    VERTEX_AI_SERVICE_ACCOUNT_JSON: vertexServiceAccountJson(),
  })
  if (configuration.state !== "configured") {
    throw new Error("Expected valid Vertex configuration")
  }
  return configuration
}

describe("Vertex Gemini configuration", () => {
  it("parses server-only Vertex service-account credentials and defaults to global", () => {
    expect(configuredGemini()).toMatchObject({
      location: "global",
      projectId: "astreex-test",
      provider: "gemini",
      state: "configured",
      timeoutMs: 120_000,
    })
  })

  it("initializes the SDK for Vertex with explicit service-account credentials", () => {
    createGeminiJsonRequester({ configuration: configuredGemini() })

    expect(googleGenAiOptions).toEqual([
      expect.objectContaining({
        googleAuthOptions: {
          credentials: expect.objectContaining({
            client_email: "astreex@astreex-test.iam.gserviceaccount.com",
            private_key: expect.any(String),
            project_id: "astreex-test",
          }),
        },
        location: "global",
        project: "astreex-test",
        vertexai: true,
      }),
    ])
  })

  it("uses Vertex structured output and explicit medium thinking", async () => {
    const generateContent = vi.fn().mockResolvedValue({
      text: '{"results":[]}',
    })
    const requester = createGeminiJsonRequester({
      client: { models: { generateContent } },
      configuration: configuredGemini(),
    })

    await expect(
      requester(
        {
          responseJsonSchema: {
            additionalProperties: false,
            properties: { results: { type: "array" } },
            required: ["results"],
            type: "object",
          },
          systemInstruction: "Apply the analysis policy.",
          userContent: '{"mentions":[]}',
        },
        new AbortController().signal,
      ),
    ).resolves.toEqual({ results: [] })
    expect(generateContent).toHaveBeenCalledWith({
      config: expect.objectContaining({
        responseJsonSchema: expect.objectContaining({
          additionalProperties: false,
          type: "object",
        }),
        responseMimeType: "application/json",
        systemInstruction: "Apply the analysis policy.",
        thinkingConfig: { thinkingLevel: "MEDIUM" },
      }),
      contents: '{"mentions":[]}',
      model: "gemini-3.5-flash-lite",
    })
  })

  it("rejects a Vertex location other than the required global endpoint", () => {
    expect(
      readGeminiRuntimeConfiguration({
        VERTEX_AI_LOCATION: "us-central1",
        VERTEX_AI_PROJECT_ID: "astreex-test",
        VERTEX_AI_SERVICE_ACCOUNT_JSON: vertexServiceAccountJson(),
      }),
    ).toEqual({
      invalid: ["VERTEX_AI_LOCATION"],
      provider: "gemini",
      state: "provider_unconfigured",
    })
  })

  it.each([
    ["malformed JSON", "private-invalid-json"],
    [
      "an unusable private key",
      JSON.stringify({
        client_email: "astreex@astreex-test.iam.gserviceaccount.com",
        private_key: "not-a-private-key",
        project_id: "astreex-test",
        type: "service_account",
      }),
    ],
  ])("rejects %s service-account configuration", (_label, credentials) => {
    expect(
      readGeminiRuntimeConfiguration({
        VERTEX_AI_PROJECT_ID: "astreex-test",
        VERTEX_AI_SERVICE_ACCOUNT_JSON: credentials,
      }),
    ).toEqual({
      invalid: ["VERTEX_AI_SERVICE_ACCOUNT_JSON"],
      provider: "gemini",
      state: "provider_unconfigured",
    })
  })

  it("maps rate limits to a secret-safe retryable failure", async () => {
    const requester = createGeminiJsonRequester({
      client: {
        models: {
          generateContent: vi.fn().mockRejectedValue({
            headers: { "retry-after": "2" },
            message: "private provider body",
            statusCode: 429,
          }),
        },
      },
      configuration: configuredGemini(),
    })

    await expect(
      requester(
        {
          responseJsonSchema: { type: "object" },
          systemInstruction: "Apply the analysis policy.",
          userContent: '{"mentions":[]}',
        },
        new AbortController().signal,
      ),
    ).rejects.toEqual(
      expect.objectContaining({
        code: "RATE_LIMIT",
        message: "Vertex Gemini rate limit exceeded",
        retryAfterMs: 2_000,
        retryable: true,
      } satisfies Partial<GeminiIntegrationError>),
    )
  })

  it("uses a Vertex RetryInfo delay after the SDK discards response headers", async () => {
    const requester = createGeminiJsonRequester({
      client: {
        models: {
          generateContent: vi.fn().mockRejectedValue(
            Object.assign(
              new Error(
                JSON.stringify({
                  error: {
                    details: [
                      {
                        "@type": "type.googleapis.com/google.rpc.RetryInfo",
                        retryDelay: "7.5s",
                      },
                    ],
                  },
                }),
              ),
              { status: 429 },
            ),
          ),
        },
      },
      configuration: configuredGemini(),
    })

    await expect(
      requester(
        {
          responseJsonSchema: { type: "object" },
          systemInstruction: "Apply the analysis policy.",
          userContent: '{"mentions":[]}',
        },
        new AbortController().signal,
      ),
    ).rejects.toEqual(
      expect.objectContaining({
        code: "RATE_LIMIT",
        retryAfterMs: 7_500,
        retryable: true,
      } satisfies Partial<GeminiIntegrationError>),
    )
  })

  it.each([
    { code: "AUTH", retryable: false, statusCode: 401 },
    { code: "INVALID_REQUEST", retryable: false, statusCode: 400 },
    { code: "REQUEST_TIMEOUT", retryable: true, statusCode: 408 },
    { code: "SERVER_ERROR", retryable: true, statusCode: 503 },
  ])(
    "classifies Vertex HTTP $statusCode as $code",
    async ({ code, retryable, statusCode }) => {
      const requester = createGeminiJsonRequester({
        client: {
          models: {
            generateContent: vi.fn().mockRejectedValue({
              message: "private provider body",
              statusCode,
            }),
          },
        },
        configuration: configuredGemini(),
      })

      await expect(
        requester(
          {
            responseJsonSchema: { type: "object" },
            systemInstruction: "Apply the analysis policy.",
            userContent: '{"mentions":[]}',
          },
          new AbortController().signal,
        ),
      ).rejects.toEqual(
        expect.objectContaining({
          code,
          retryable,
          status: statusCode,
        }),
      )
    },
  )

  it("maps malformed structured JSON to a retryable safe error", async () => {
    const requester = createGeminiJsonRequester({
      client: {
        models: { generateContent: vi.fn().mockResolvedValue({ text: "{" }) },
      },
      configuration: configuredGemini(),
    })

    await expect(
      requester(
        {
          responseJsonSchema: { type: "object" },
          systemInstruction: "Apply the analysis policy.",
          userContent: '{"mentions":[]}',
        },
        new AbortController().signal,
      ),
    ).rejects.toEqual(
      expect.objectContaining({
        code: "INVALID_RESPONSE",
        message: "Vertex Gemini returned invalid structured JSON",
        retryable: true,
      }),
    )
  })
})
