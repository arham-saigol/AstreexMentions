import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Page, type TestInfo } from "@playwright/test"

const protectedCustomerRoutes = [
  { destination: "/app", path: "/app" },
  { destination: "/app", path: "/app/mentions" },
  { destination: "/app", path: "/app/keywords" },
  { destination: "/onboarding", path: "/onboarding" },
] as const

type ConfigurationIssue = {
  reason: "invalid" | "missing"
  variable: string
}

function keyIssue(
  variable: string,
  value: string | undefined,
  expectedPrefix: string,
): ConfigurationIssue | null {
  const normalized = value?.trim()
  if (!normalized) {
    return { reason: "missing", variable }
  }
  if (!normalized.startsWith(expectedPrefix)) {
    return { reason: "invalid", variable }
  }
  return null
}

function convexIssue(value: string | undefined): ConfigurationIssue | null {
  const normalized = value?.trim()
  if (!normalized) {
    return { reason: "missing", variable: "NEXT_PUBLIC_CONVEX_URL" }
  }

  try {
    const url = new URL(normalized)
    const local =
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1")
    if (url.protocol !== "https:" && !local) {
      return { reason: "invalid", variable: "NEXT_PUBLIC_CONVEX_URL" }
    }
  } catch {
    return { reason: "invalid", variable: "NEXT_PUBLIC_CONVEX_URL" }
  }

  return null
}

const clerkIssues = [
  keyIssue(
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    "pk_",
  ),
  keyIssue("CLERK_SECRET_KEY", process.env.CLERK_SECRET_KEY, "sk_"),
].filter((issue): issue is ConfigurationIssue => issue !== null)
const convexIssues = [convexIssue(process.env.NEXT_PUBLIC_CONVEX_URL)].filter(
  (issue): issue is ConfigurationIssue => issue !== null,
)
const runtimeIssues = [...clerkIssues, ...convexIssues]

function skipUnlessLightDesktop(testInfo: TestInfo) {
  test.skip(
    testInfo.project.name !== "chromium-light",
    "Customer gate assertions run once in the chromium-light project.",
  )
}

async function expectNoAccessibilityViolations(page: Page) {
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

test.describe("protected customer route gates", () => {
  for (const route of protectedCustomerRoutes) {
    test(`${route.path} stops at configuration or authentication before customer data`, async ({
      page,
    }, testInfo) => {
      skipUnlessLightDesktop(testInfo)
      await page.goto(route.path)

      if (runtimeIssues.length > 0) {
        await expect(page).toHaveURL((url) => url.pathname === route.path)
        await expect(
          page.getByRole("heading", {
            level: 1,
            name: "The customer account needs configuration",
          }),
        ).toBeVisible()
        await expect(
          page.getByText(
            "Protected account and subscription data remain unavailable until Clerk and Convex are both configured. Astreex is not showing sample customer data in their place.",
          ),
        ).toBeVisible()
        await expect(
          page.getByRole("navigation", { name: "Product navigation" }),
        ).toHaveCount(0)
        await expect(
          page.getByRole("button", { name: "Open account menu" }),
        ).toHaveCount(0)
        await expect(page.getByText("Opening your dashboard")).toHaveCount(0)
        await expect(page.getByText("Mentions", { exact: true })).toHaveCount(0)

        const issueVariables = page
          .getByRole("list", { name: "Configuration issues" })
          .locator("code")
        await expect(issueVariables).toHaveText(
          runtimeIssues.map(({ variable }) => variable),
        )
        await expectNoAccessibilityViolations(page)
        return
      }

      await expect(page).toHaveURL((url) => {
        return (
          url.pathname === "/sign-in" &&
          url.searchParams.get("redirect_url") === route.destination
        )
      })
      await expect(
        page.getByRole("navigation", { name: "Product navigation" }),
      ).toHaveCount(0)
    })
  }
})
