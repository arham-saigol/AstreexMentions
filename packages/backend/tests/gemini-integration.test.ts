import { describe, expect, it, vi } from "vitest"

import {
  createGeminiJsonRequester,
  GeminiIntegrationError,
  readGeminiRuntimeConfiguration,
} from "../convex/integrations/gemini"

describe("Vertex Gemini configuration", () => {
  it("parses server-only Vertex service-account credentials and defaults to global", () => {
    const configuration = readGeminiRuntimeConfiguration({
      VERTEX_AI_PROJECT_ID: "astreex-test",
      VERTEX_AI_SERVICE_ACCOUNT_JSON: JSON.stringify({
        client_email: "astreex@astreex-test.iam.gserviceaccount.com",
        private_key:
          "-----BEGIN PRIVATE KEY-----\nprivate\n-----END PRIVATE KEY-----\n",
        project_id: "astreex-test",
        type: "service_account",
      }),
    })

    expect(configuration).toMatchObject({
      location: "global",
      projectId: "astreex-test",
      provider: "gemini",
      state: "configured",
      timeoutMs: 120_000,
    })
  })

  it("uses Vertex structured output and explicit medium thinking", async () => {
    const configuration = readGeminiRuntimeConfiguration({
      VERTEX_AI_PROJECT_ID: "astreex-test",
      VERTEX_AI_SERVICE_ACCOUNT_JSON: JSON.stringify({
        client_email: "astreex@astreex-test.iam.gserviceaccount.com",
        private_key:
          "-----BEGIN PRIVATE KEY-----\nprivate\n-----END PRIVATE KEY-----\n",
        project_id: "astreex-test",
        type: "service_account",
      }),
    })
    if (configuration.state !== "configured") {
      throw new Error("Expected valid Vertex configuration")
    }
    const generateContent = vi.fn().mockResolvedValue({
      text: '{"results":[]}',
    })
    const requester = createGeminiJsonRequester({
      client: { models: { generateContent } },
      configuration,
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
        VERTEX_AI_SERVICE_ACCOUNT_JSON: JSON.stringify({
          client_email: "astreex@astreex-test.iam.gserviceaccount.com",
          private_key:
            "-----BEGIN PRIVATE KEY-----\\nprivate\\n-----END PRIVATE KEY-----\\n",
          project_id: "astreex-test",
          type: "service_account",
        }),
      }),
    ).toEqual({
      invalid: ["VERTEX_AI_LOCATION"],
      provider: "gemini",
      state: "provider_unconfigured",
    })
  })

  it("rejects malformed service-account configuration without retaining its JSON", () => {
    expect(
      readGeminiRuntimeConfiguration({
        VERTEX_AI_PROJECT_ID: "astreex-test",
        VERTEX_AI_SERVICE_ACCOUNT_JSON: "private-invalid-json",
      }),
    ).toEqual({
      invalid: ["VERTEX_AI_SERVICE_ACCOUNT_JSON"],
      provider: "gemini",
      state: "provider_unconfigured",
    })
  })

  it("maps rate limits to a secret-safe retryable failure", async () => {
    const configuration = readGeminiRuntimeConfiguration({
      VERTEX_AI_PROJECT_ID: "astreex-test",
      VERTEX_AI_SERVICE_ACCOUNT_JSON: JSON.stringify({
        client_email: "astreex@astreex-test.iam.gserviceaccount.com",
        private_key:
          "-----BEGIN PRIVATE KEY-----\nprivate\n-----END PRIVATE KEY-----\n",
        project_id: "astreex-test",
        type: "service_account",
      }),
    })
    if (configuration.state !== "configured") {
      throw new Error("Expected valid Vertex configuration")
    }
    const requester = createGeminiJsonRequester({
      client: {
        models: {
          generateContent: vi.fn().mockRejectedValue({
            headers: new Headers({ "retry-after": "2" }),
            message: "private provider body",
            statusCode: 429,
          }),
        },
      },
      configuration,
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

  it.each([
    { code: "AUTH", retryable: false, statusCode: 401 },
    { code: "INVALID_REQUEST", retryable: false, statusCode: 400 },
    { code: "REQUEST_TIMEOUT", retryable: true, statusCode: 408 },
    { code: "SERVER_ERROR", retryable: true, statusCode: 503 },
  ])(
    "classifies Vertex HTTP $statusCode as $code",
    async ({ code, retryable, statusCode }) => {
      const configuration = readGeminiRuntimeConfiguration({
        VERTEX_AI_PROJECT_ID: "astreex-test",
        VERTEX_AI_SERVICE_ACCOUNT_JSON: JSON.stringify({
          client_email: "astreex@astreex-test.iam.gserviceaccount.com",
          private_key:
            "-----BEGIN PRIVATE KEY-----\\nprivate\\n-----END PRIVATE KEY-----\\n",
          project_id: "astreex-test",
          type: "service_account",
        }),
      })
      if (configuration.state !== "configured") {
        throw new Error("Expected valid Vertex configuration")
      }
      const requester = createGeminiJsonRequester({
        client: {
          models: {
            generateContent: vi.fn().mockRejectedValue({
              message: "private provider body",
              statusCode,
            }),
          },
        },
        configuration,
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
    const configuration = readGeminiRuntimeConfiguration({
      VERTEX_AI_PROJECT_ID: "astreex-test",
      VERTEX_AI_SERVICE_ACCOUNT_JSON: JSON.stringify({
        client_email: "astreex@astreex-test.iam.gserviceaccount.com",
        private_key:
          "-----BEGIN PRIVATE KEY-----\\nprivate\\n-----END PRIVATE KEY-----\\n",
        project_id: "astreex-test",
        type: "service_account",
      }),
    })
    if (configuration.state !== "configured") {
      throw new Error("Expected valid Vertex configuration")
    }
    const requester = createGeminiJsonRequester({
      client: {
        models: { generateContent: vi.fn().mockResolvedValue({ text: "{" }) },
      },
      configuration,
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
