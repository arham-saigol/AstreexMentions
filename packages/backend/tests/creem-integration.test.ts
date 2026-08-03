import { createHmac } from "node:crypto"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it, vi } from "vitest"

import {
  CREEM_PRODUCTION_API_BASE_URL,
  CREEM_TEST_API_BASE_URL,
  CREEM_WEBHOOK_EVENT_TYPES,
  createCreemClient,
  CreemIntegrationError,
  parseCreemWebhookEvent,
  verifyCreemWebhookSignature,
} from "../convex/integrations/creem"
import {
  readCreemCheckoutConfiguration,
  readCreemWebhookConfiguration,
} from "../convex/billing/config"

function fixture(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`./fixtures/creem/${name}`, import.meta.url)),
    "utf8",
  )
}

describe("Creem HTTP integration", () => {
  it("uses the documented bases, x-api-key auth, and checkout contract", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe(`${CREEM_TEST_API_BASE_URL}/checkouts`)
        expect(init?.method).toBe("POST")
        expect(init?.headers).toEqual({
          "Content-Type": "application/json",
          "x-api-key": "creem_test_fixture",
        })
        expect(JSON.parse(String(init?.body))).toEqual({
          customer: { email: "owner@example.test" },
          metadata: { internal_customer_id: "workspace_fixture_1" },
          product_id: "prod_growth",
          request_id: "checkout-request-fixture-1",
          success_url: "https://app.example.test/billing/return",
        })

        return new Response(
          JSON.stringify({
            checkout_url: "https://checkout.creem.test/ch_fixture_1",
            id: "ch_fixture_1",
            mode: "test",
            object: "checkout",
            product: "prod_growth",
            request_id: "checkout-request-fixture-1",
            status: "pending",
          }),
          { status: 200 },
        )
      },
    )

    const result = await createCreemClient({
      apiKey: "creem_test_fixture",
      fetch: fetchMock as typeof fetch,
      mode: "test",
    }).createCheckout({
      customerEmail: "owner@example.test",
      metadata: { internal_customer_id: "workspace_fixture_1" },
      productId: "prod_growth",
      requestId: "checkout-request-fixture-1",
      successUrl: "https://app.example.test/billing/return",
    })

    expect(result).toEqual({
      checkoutId: "ch_fixture_1",
      status: "pending",
      url: "https://checkout.creem.test/ch_fixture_1",
    })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it("rejects non-HTTPS checkout redirects from the provider", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          checkout_url: "javascript:alert(document.domain)",
          id: "ch_unsafe_redirect",
          mode: "test",
          object: "checkout",
          product: "prod_growth",
          status: "pending",
        }),
        { status: 200 },
      )
    })

    await expect(
      createCreemClient({
        apiKey: "creem_test_fixture",
        fetch: fetchMock as typeof fetch,
        mode: "test",
      }).createCheckout({
        productId: "prod_growth",
        requestId: "checkout-unsafe-redirect",
        successUrl: "https://app.example.test/billing/return",
      }),
    ).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    })
  })

  it("uses the documented immediate-proration upgrade endpoint", async () => {
    const response = JSON.parse(fixture("subscription-upgrade.json")).object
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe(
          `${CREEM_PRODUCTION_API_BASE_URL}/subscriptions/sub_fixture_1/upgrade`,
        )
        expect(JSON.parse(String(init?.body))).toEqual({
          product_id: "prod_scale",
          update_behavior: "proration-charge-immediately",
        })
        return new Response(JSON.stringify(response), { status: 200 })
      },
    )

    const upgraded = await createCreemClient({
      apiKey: "creem_prod_fixture",
      fetch: fetchMock as typeof fetch,
      mode: "production",
    }).upgradeSubscription({
      productId: "prod_scale",
      subscriptionId: "sub_fixture_1",
    })

    expect(upgraded.id).toBe("sub_fixture_1")
    expect(upgraded.product).toMatchObject({ id: "prod_scale" })
  })

  it("uses the documented customer billing portal contract", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe(
          `${CREEM_TEST_API_BASE_URL}/customers/billing`,
        )
        expect(JSON.parse(String(init?.body))).toEqual({
          customer_id: "cust_fixture_1",
        })
        return new Response(
          JSON.stringify({
            customer_portal_link:
              "https://creem.io/my-orders/login/fixture-token",
          }),
          { status: 200 },
        )
      },
    )

    await expect(
      createCreemClient({
        apiKey: "creem_test_fixture",
        fetch: fetchMock as typeof fetch,
        mode: "test",
      }).createBillingPortal({ customerId: "cust_fixture_1" }),
    ).resolves.toEqual({
      url: "https://creem.io/my-orders/login/fixture-token",
    })
  })

  it("rejects non-HTTPS billing portal redirects from the provider", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            customer_portal_link: "javascript:alert(document.domain)",
          }),
          { status: 200 },
        ),
    )

    await expect(
      createCreemClient({
        apiKey: "creem_test_fixture",
        fetch: fetchMock as typeof fetch,
        mode: "test",
      }).createBillingPortal({ customerId: "cust_fixture_1" }),
    ).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    })
  })

  it("aborts timed-out fetches with a typed retryable error", async () => {
    const fetchMock = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"))
          })
        }),
    )

    await expect(
      createCreemClient({
        apiKey: "creem_test_fixture",
        fetch: fetchMock as typeof fetch,
        mode: "test",
        timeoutMs: 1,
      }).createBillingPortal({ customerId: "cust_fixture_1" }),
    ).rejects.toMatchObject({
      code: "REQUEST_TIMEOUT",
      retryable: true,
    })
  })
})

describe("Creem webhook contract", () => {
  it("verifies HMAC-SHA256 against the unmodified raw body", async () => {
    const rawBody = fixture("checkout-completed.json")
    const secret = "creem_webhook_fixture_secret"
    const signature = createHmac("sha256", secret).update(rawBody).digest("hex")

    await expect(
      verifyCreemWebhookSignature({ rawBody, secret, signature }),
    ).resolves.toBe(true)
    await expect(
      verifyCreemWebhookSignature({
        rawBody: `${rawBody}\n`,
        secret,
        signature,
      }),
    ).resolves.toBe(false)
  })

  it("parses fixture events and rejects an undocumented event name", () => {
    expect(
      parseCreemWebhookEvent(fixture("checkout-completed.json")),
    ).toMatchObject({
      eventType: "checkout.completed",
      id: "evt_checkout_completed_1",
    })
    expect(
      parseCreemWebhookEvent(fixture("subscription-paid.json")),
    ).toMatchObject({
      eventType: "subscription.paid",
      id: "evt_paid_20260701",
    })
    expect(CREEM_WEBHOOK_EVENT_TYPES).not.toContain("subscription.unpaid")

    const undocumented = JSON.parse(fixture("subscription-paid.json"))
    undocumented.eventType = "subscription.unpaid"
    expect(() => parseCreemWebhookEvent(JSON.stringify(undocumented))).toThrow(
      CreemIntegrationError,
    )
  })
})

describe("Creem configuration", () => {
  it("returns honest provider_unconfigured states without secrets", () => {
    expect(readCreemCheckoutConfiguration({}, "growth")).toEqual({
      missing: [
        "CREEM_API_KEY",
        "CREEM_CHECKOUT_SUCCESS_URL",
        "CREEM_MODE",
        "CREEM_PRODUCT_ID_GROWTH",
        "CREEM_PRODUCT_ID_SCALE",
        "CREEM_PRODUCT_ID_STARTER",
      ],
      state: "provider_unconfigured",
    })
    expect(readCreemWebhookConfiguration({})).toEqual({
      missing: [
        "CREEM_PRODUCT_ID_GROWTH",
        "CREEM_PRODUCT_ID_SCALE",
        "CREEM_PRODUCT_ID_STARTER",
        "CREEM_WEBHOOK_SECRET",
      ],
      state: "provider_unconfigured",
    })
  })

  it("maps separate product IDs to domain-owned plan limits", () => {
    const result = readCreemCheckoutConfiguration(
      {
        CREEM_API_KEY: "creem_secret_fixture",
        CREEM_CHECKOUT_SUCCESS_URL: "https://app.example.test/billing/return",
        CREEM_MODE: "test",
        CREEM_PRODUCT_ID_GROWTH: "prod_growth",
        CREEM_PRODUCT_ID_SCALE: "prod_scale",
        CREEM_PRODUCT_ID_STARTER: "prod_starter",
      },
      "growth",
    )

    expect(result).toMatchObject({
      mode: "test",
      plan: {
        keywordLimit: 6,
        mentionLimit: 20_000,
        planId: "growth",
        productId: "prod_growth",
      },
      state: "configured",
    })
    expect(result.state).toBe("configured")
  })

  it("rejects a product ID reused by multiple plans", () => {
    expect(
      readCreemWebhookConfiguration({
        CREEM_PRODUCT_ID_GROWTH: "prod_duplicate",
        CREEM_PRODUCT_ID_SCALE: "prod_duplicate",
        CREEM_PRODUCT_ID_STARTER: "prod_starter",
        CREEM_WEBHOOK_SECRET: "webhook_secret",
      }),
    ).toEqual({
      missing: [
        "CREEM_PRODUCT_ID_GROWTH",
        "CREEM_PRODUCT_ID_SCALE",
        "CREEM_PRODUCT_ID_STARTER",
      ],
      state: "provider_unconfigured",
    })
  })
})
