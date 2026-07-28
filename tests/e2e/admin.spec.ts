import AxeBuilder from "@axe-core/playwright"
import { clerk, clerkSetup } from "@clerk/testing/playwright"
import {
  expect,
  test,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test"

const adminUrl = new URL(
  process.env.PLAYWRIGHT_ADMIN_URL ?? "http://localhost:3001",
).origin

const adminNavigation = [
  { label: "Metrics", path: "/metrics" },
  { label: "Feature Requests", path: "/feature-requests" },
  { label: "Changelog", path: "/changelog" },
] as const

const protectedAdminPaths = [
  "/",
  "/metrics",
  "/feature-requests",
  "/changelog",
  "/sign-in",
  "/unauthorized",
] as const

const adminAuthValuesAbsent = [
  process.env.ADMIN_CLERK_USER_ID,
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  process.env.CLERK_SECRET_KEY,
].every((value) => !value?.trim())

type ConnectedAdminEnvironment = Readonly<{
  adminUserId: string
  clerkPublishableKey: string
  clerkSecretKey: string
  convexUrl: string
  testUserEmail: string
  testUserPassword: string
}>

function readConnectedAdminEnvironment(): ConnectedAdminEnvironment | null {
  const values = {
    adminUserId: process.env.ADMIN_CLERK_USER_ID?.trim(),
    clerkPublishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim(),
    clerkSecretKey: process.env.CLERK_SECRET_KEY?.trim(),
    convexUrl: process.env.NEXT_PUBLIC_CONVEX_URL?.trim(),
    testUserEmail: process.env.CLERK_TEST_USER_EMAIL?.trim(),
    testUserPassword: process.env.CLERK_TEST_USER_PASSWORD?.trim(),
  }

  if (Object.values(values).some((value) => !value)) {
    return null
  }

  return values as ConnectedAdminEnvironment
}

const connectedAdminEnvironment = readConnectedAdminEnvironment()

async function expectNoIndexMetadata(page: Page) {
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  )
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /nofollow/,
  )
  await expect(page.locator('meta[name="googlebot"]')).toHaveAttribute(
    "content",
    /noindex/,
  )
}

async function expectNoSeriousAccessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page })
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

async function expectResponsiveDocument(page: Page, testInfo: TestInfo) {
  const expectedColorScheme = testInfo.project.name.includes("dark")
    ? "dark"
    : "light"

  await expect(page.locator("html")).toHaveClass(
    new RegExp(`(^|\\s)${expectedColorScheme}(\\s|$)`),
  )

  const dimensions = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }))

  expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth)
}

async function openAdminNavigation(page: Page): Promise<Locator> {
  const navigation = page.getByRole("navigation", {
    name: "Admin navigation",
  })

  if (!(await navigation.isVisible())) {
    await page.getByRole("button", { name: "Toggle navigation" }).click()
  }

  await expect(navigation).toBeVisible()
  return navigation
}

async function expectExactAdminNavigation(page: Page) {
  const navigation = await openAdminNavigation(page)
  const links = navigation.getByRole("link")

  await expect(links).toHaveCount(adminNavigation.length)
  await expect(links).toHaveText(adminNavigation.map(({ label }) => label))

  for (const { label, path } of adminNavigation) {
    await expect(navigation.getByRole("link", { name: label })).toHaveAttribute(
      "href",
      path,
    )
  }

  const mobileToggle = page.getByRole("button", { name: "Toggle navigation" })
  if (await mobileToggle.isVisible()) {
    await mobileToggle.click()
  }
}

async function expectChartTableOrEmpty({
  emptyText,
  headers,
  section,
  tableName,
}: {
  emptyText: string
  headers: readonly string[]
  section: Locator
  tableName: string
}) {
  const tableToggle = section.getByText("View data table", { exact: true })

  if ((await tableToggle.count()) === 0) {
    await expect(section.getByText(emptyText, { exact: true })).toBeVisible()
    return
  }

  await tableToggle.click()
  const table = section.getByRole("table", { name: tableName })
  await expect(table).toBeVisible()
  await expect(table.getByRole("columnheader")).toHaveText(headers)
  await expect(table.locator("tbody tr").first()).toBeVisible()
}

async function signInAsConfiguredAdmin(page: Page) {
  if (!connectedAdminEnvironment) {
    throw new Error("Connected admin environment is unavailable")
  }

  await page.goto(`${adminUrl}/sign-in`)
  await clerk.signIn({
    page,
    signInParams: {
      strategy: "password",
      identifier: connectedAdminEnvironment.testUserEmail,
      password: connectedAdminEnvironment.testUserPassword,
    },
  })
  await page.goto(`${adminUrl}/metrics`)
  await expect(page).toHaveURL(`${adminUrl}/metrics`)
}

test.describe("admin fail-closed configuration", () => {
  test.skip(
    !adminAuthValuesAbsent,
    "Requires ADMIN_CLERK_USER_ID and both Clerk authentication values to be absent. Convex configuration does not affect this fail-closed authentication state.",
  )

  test("redirects every admin document and returns an uncached API 503", async ({
    request,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium-light",
      "HTTP redirect and API assertions run once in chromium-light.",
    )

    for (const path of protectedAdminPaths) {
      const response = await request.get(`${adminUrl}${path}`, {
        maxRedirects: 0,
      })

      expect(response.status(), path).toBeGreaterThanOrEqual(300)
      expect(response.status(), path).toBeLessThan(400)
      expect(
        new URL(response.headers().location ?? "", adminUrl).pathname,
      ).toBe("/configuration")
    }

    const sessionResponse = await request.get(`${adminUrl}/api/admin/session`, {
      maxRedirects: 0,
    })

    expect(sessionResponse.status()).toBe(503)
    expect(sessionResponse.headers()["cache-control"]).toContain("no-store")
    await expect(sessionResponse.json()).resolves.toEqual({
      allowed: false,
      reason: "configuration",
    })
  })

  test("shows a responsive, noindex, accessible configuration state without admin data", async ({
    page,
  }, testInfo) => {
    await page.goto(`${adminUrl}/metrics`)
    await expect(page).toHaveURL(`${adminUrl}/configuration`)

    await expect(
      page.getByText("Admin access is not configured", { exact: true }),
    ).toBeVisible()
    await expect(
      page.getByText(
        "Access remains denied until every required server-side authentication value is present.",
        { exact: true },
      ),
    ).toBeVisible()

    const requirements = page.getByRole("list", {
      name: "Configuration requirements",
    })
    await expect(
      requirements.getByText("ADMIN_CLERK_USER_ID", { exact: true }),
    ).toBeVisible()
    await expect(
      requirements.getByText("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", {
        exact: true,
      }),
    ).toBeVisible()
    await expect(
      requirements.getByText("CLERK_SECRET_KEY", { exact: true }),
    ).toBeVisible()

    await expect(
      page.getByRole("navigation", { name: "Admin navigation" }),
    ).toHaveCount(0)
    for (const { label } of adminNavigation) {
      await expect(page.getByRole("link", { name: label })).toHaveCount(0)
    }

    await expect(
      page.getByText("Total workspaces", { exact: true }),
    ).toHaveCount(0)
    await expect(page.getByText("Request queue", { exact: true })).toHaveCount(
      0,
    )
    await expect(
      page.getByText("New changelog draft", { exact: true }),
    ).toHaveCount(0)

    await expectNoIndexMetadata(page)
    await expectResponsiveDocument(page, testInfo)
    await expectNoSeriousAccessibilityViolations(page)
  })
})

test.describe("connected admin flows", () => {
  test.describe.configure({ mode: "serial" })
  test.skip(
    !connectedAdminEnvironment,
    "Requires configured admin, Clerk, Convex, and CLERK_TEST_USER_EMAIL/CLERK_TEST_USER_PASSWORD values.",
  )

  test.beforeAll(async ({ browserName: _browserName }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium-light",
      "Connected admin coverage runs once in chromium-light.",
    )

    if (!connectedAdminEnvironment) {
      return
    }

    await clerkSetup({
      dotenv: false,
      publishableKey: connectedAdminEnvironment.clerkPublishableKey,
      secretKey: connectedAdminEnvironment.clerkSecretKey,
    })
  })

  test.beforeEach(async ({ page }, testInfo) => {
    testInfo.setTimeout(60_000)
    test.skip(
      testInfo.project.name !== "chromium-light",
      "Connected admin coverage runs once in chromium-light to avoid repeated real-account sign-ins and queries.",
    )
    await signInAsConfiguredAdmin(page)
  })

  test("shows only the three approved navigation entries and usable metrics tables", async ({
    page,
  }) => {
    await expectExactAdminNavigation(page)
    await expectNoIndexMetadata(page)

    const filters = page.getByRole("form", { name: "Metrics filters" })
    await expect(filters.getByLabel("Date range")).toHaveValue("30")
    await filters.getByLabel("Date range").selectOption("7")
    await filters.getByRole("button", { name: "Apply" }).click()
    await expect(page).toHaveURL(`${adminUrl}/metrics?days=7`)
    await expect(filters.getByLabel("Date range")).toHaveValue("7")

    const summary = page.getByRole("heading", { name: "Metric summary" })
    await expect(summary).toBeAttached()
    for (const label of [
      "Workspaces",
      "Active workspaces",
      "Mentions",
      "Emails delivered",
    ]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible()
    }

    await expectChartTableOrEmpty({
      section: page.getByRole("region", { name: "Mention trend" }),
      tableName: "Daily mention volume",
      headers: ["Date", "Mentions"],
      emptyText: "No mention volume was returned for this date range.",
    })
    await expectChartTableOrEmpty({
      section: page.getByRole("region", { name: "Mentions by category" }),
      tableName: "Mention counts by category",
      headers: ["Category", "Mentions"],
      emptyText: "No categorized mentions were returned for this date range.",
    })
    await expectChartTableOrEmpty({
      section: page.getByRole("region", {
        name: "Provider request outcomes",
      }),
      tableName: "Provider request totals, outcomes, and latency",
      headers: ["Provider", "Requests", "Succeeded", "Failed", "Avg. latency"],
      emptyText: "No provider runs were returned for this date range.",
    })

    await expectNoSeriousAccessibilityViolations(page)
  })

  test("queries and filters the real feature request queue without mocked data", async ({
    page,
  }) => {
    await page.goto(`${adminUrl}/feature-requests`)
    await expect(page).toHaveURL(`${adminUrl}/feature-requests`)
    await expectExactAdminNavigation(page)
    await expectNoIndexMetadata(page)

    const search = page.getByRole("search")
    await expect(search.getByLabel("Status")).toHaveValue("")
    await expect(search.getByLabel("Sort")).toHaveValue("newest")

    const noMatchQuery = `e2e-no-match-${Date.now()}`
    await search.getByLabel("Search").fill(noMatchQuery)
    await search.getByRole("button", { name: "Apply" }).click()

    await expect(page).toHaveURL((url) => {
      return (
        url.origin === adminUrl &&
        url.pathname === "/feature-requests" &&
        url.searchParams.get("q") === noMatchQuery
      )
    })
    await expect(
      page.getByText("0 matching requests on this page", { exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole("heading", { name: "No feature requests found" }),
    ).toBeVisible()
    await expect(page.getByRole("link", { name: "Clear" })).toBeVisible()

    await expectNoSeriousAccessibilityViolations(page)
  })

  test("loads real changelog groups and keeps draft preview client-side until submission", async ({
    page,
  }) => {
    await page.goto(`${adminUrl}/changelog`)
    await expect(page).toHaveURL(`${adminUrl}/changelog`)
    await expectExactAdminNavigation(page)
    await expectNoIndexMetadata(page)

    const form = page.getByRole("form", { name: "Create changelog draft" })
    const preview = page.getByRole("region", {
      name: "Sanitized changelog preview",
    })
    const draftMarker = `E2E preview ${Date.now()}`

    await form.getByLabel("Title").fill(draftMarker)
    await form.getByLabel("Slug").fill(`e2e-preview-${Date.now()}`)
    await form.getByLabel("Label (optional)").fill("Testing")
    await form.getByLabel("Summary").fill("Preview-only summary")
    await form.getByLabel("Body").fill("Preview-only body")

    await expect(
      preview.getByRole("heading", { name: draftMarker }),
    ).toBeVisible()
    await expect(
      preview.getByText("Preview-only summary", { exact: true }),
    ).toBeVisible()
    await expect(
      preview.getByText("Preview-only body", { exact: true }),
    ).toBeVisible()
    await expect(
      preview.getByText("Draft preview", { exact: true }),
    ).toBeVisible()

    await page.getByRole("link", { name: "Drafts", exact: true }).click()
    await expect(page).toHaveURL(`${adminUrl}/changelog?status=draft`)
    await expect(
      page.getByRole("heading", { name: "Drafts", exact: true }),
    ).toBeVisible()
    await expect(page.getByRole("heading", { name: "Published" })).toHaveCount(
      0,
    )

    await expectNoSeriousAccessibilityViolations(page)
  })
})
