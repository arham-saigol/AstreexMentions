import AxeBuilder from "@axe-core/playwright"
import { clerk, clerkSetup } from "@clerk/testing/playwright"
import { expect, test, type Page } from "@playwright/test"

type ConnectedCustomerEnvironment = Readonly<{
  clerkPublishableKey: string
  clerkSecretKey: string
  convexUrl: string
  testUserEmail: string
  testUserPassword: string
}>

function readConnectedCustomerEnvironment(): ConnectedCustomerEnvironment | null {
  const values = {
    clerkPublishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim(),
    clerkSecretKey: process.env.CLERK_SECRET_KEY?.trim(),
    convexUrl: process.env.NEXT_PUBLIC_CONVEX_URL?.trim(),
    testUserEmail: process.env.CLERK_TEST_USER_EMAIL?.trim(),
    testUserPassword: process.env.CLERK_TEST_USER_PASSWORD?.trim(),
  }

  if (Object.values(values).some((value) => !value)) {
    return null
  }

  return values as ConnectedCustomerEnvironment
}

const connectedCustomerEnvironment = readConnectedCustomerEnvironment()

async function expectNoAccessibilityViolations(page: Page, selector: string) {
  const results = await new AxeBuilder({ page })
    .include(selector)
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze()

  expect(
    results.violations,
    results.violations
      .map(
        (violation) =>
          `${violation.id}: ${violation.nodes
            .map((node) => node.target.join(" "))
            .join(", ")}`,
      )
      .join("\n"),
  ).toEqual([])
}

async function signInToConnectedCustomer(page: Page) {
  if (!connectedCustomerEnvironment) {
    throw new Error("Connected customer environment is unavailable")
  }

  await page.goto("/")
  await clerk.signIn({
    page,
    signInParams: {
      strategy: "password",
      identifier: connectedCustomerEnvironment.testUserEmail,
      password: connectedCustomerEnvironment.testUserPassword,
    },
  })
  await page.goto("/app")
  await expect(
    page.getByRole("button", { name: "Open account menu" }),
  ).toBeVisible({ timeout: 30_000 })
  await expect(page).toHaveURL(/\/(?:app\/mentions|onboarding)$/)
}

test.describe("connected customer dialogs", () => {
  test.describe.configure({ mode: "serial" })
  test.skip(
    !connectedCustomerEnvironment,
    "Requires NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY, NEXT_PUBLIC_CONVEX_URL, CLERK_TEST_USER_EMAIL, and CLERK_TEST_USER_PASSWORD. No authentication or customer data is mocked.",
  )

  test.beforeAll(async ({ browserName: _browserName }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium-light",
      "Connected customer dialog coverage runs once in chromium-light.",
    )

    if (!connectedCustomerEnvironment) {
      return
    }

    await clerkSetup({
      dotenv: false,
      publishableKey: connectedCustomerEnvironment.clerkPublishableKey,
      secretKey: connectedCustomerEnvironment.clerkSecretKey,
    })
  })

  test.beforeEach(async ({ page }, testInfo) => {
    testInfo.setTimeout(60_000)
    test.skip(
      testInfo.project.name !== "chromium-light",
      "Connected customer dialog coverage runs once in chromium-light.",
    )
    await signInToConnectedCustomer(page)
  })

  test("opens settings with keyboard-safe focus and no accessibility violations", async ({
    page,
  }) => {
    const accountMenu = page.getByRole("button", { name: "Open account menu" })
    await accountMenu.click()
    await page.getByRole("menuitem", { name: "Settings" }).click()

    const dialog = page.getByRole("dialog", { name: "Settings" })
    await expect(dialog).toBeVisible()
    await expect(
      dialog.getByText(
        "Manage this account, monitoring preferences, and billing.",
      ),
    ).toBeVisible()
    await expect(dialog.getByRole("tab", { name: "General" })).toHaveAttribute(
      "aria-selected",
      "true",
    )
    for (const section of [
      "General",
      "Categories",
      "Billing",
      "Usage",
      "Digest",
    ]) {
      await expect(dialog.getByRole("tab", { name: section })).toBeVisible()
    }

    await expectNoAccessibilityViolations(page, '[role="dialog"]')
    await page.keyboard.press("Escape")
    await expect(dialog).toHaveCount(0)
    await expect(accountMenu).toBeFocused()
  })

  test("opens the feature request dialog without submitting fabricated data", async ({
    page,
  }) => {
    const accountMenu = page.getByRole("button", { name: "Open account menu" })
    await accountMenu.click()
    await page.getByRole("menuitem", { name: "Feature Requests" }).click()

    const dialog = page.getByRole("dialog", { name: "Feature Requests" })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByLabel("Title")).toBeFocused()
    await expect(dialog.getByLabel("Description")).toBeVisible()
    await expect(
      dialog.getByText(
        "Do not include passwords, API keys, or other sensitive information.",
      ),
    ).toBeVisible()
    await expect(
      dialog.getByRole("button", { name: "Submit request" }),
    ).toBeEnabled()

    await expectNoAccessibilityViolations(page, '[role="dialog"]')
    await page.keyboard.press("Escape")
    await expect(dialog).toHaveCount(0)
    await expect(accountMenu).toBeFocused()
  })
})
