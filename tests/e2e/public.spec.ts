import AxeBuilder from "@axe-core/playwright"
import {
  expect,
  test,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test"

const expectedBlogPosts = [
  {
    slug: "cross-platform-customer-monitoring",
    title:
      "Cross-platform customer monitoring without building a wall of noise",
  },
  {
    slug: "build-a-customer-keyword-strategy",
    title: "How to build a customer keyword strategy that stays useful",
  },
  {
    slug: "mention-triage-framework",
    title: "A mention triage framework for turning feedback into action",
  },
] as const

const clerkIssueVariables = [
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim().startsWith("pk_")
    ? null
    : "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  process.env.CLERK_SECRET_KEY?.trim().startsWith("sk_")
    ? null
    : "CLERK_SECRET_KEY",
].filter((variable): variable is string => variable !== null)
const clerkConfigured = clerkIssueVariables.length === 0

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

async function horizontalOverflowFailure(
  page: Page,
  context: string,
): Promise<string | null> {
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
  const dimensions = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth
    const overflowingElements = Array.from(document.body.querySelectorAll("*"))
      .map((element) => {
        const rectangle = element.getBoundingClientRect()
        return {
          className: element.getAttribute("class") ?? "",
          left: Math.round(rectangle.left),
          right: Math.round(rectangle.right),
          tagName: element.tagName.toLowerCase(),
        }
      })
      .filter(({ left, right }) => left < -1 || right > viewportWidth + 1)
      .slice(0, 12)

    return {
      bodyWidth: document.body.scrollWidth,
      documentWidth: document.documentElement.scrollWidth,
      overflowingElements,
      viewportWidth,
    }
  })

  return Math.max(dimensions.bodyWidth, dimensions.documentWidth) <=
    dimensions.viewportWidth + 1
    ? null
    : `${context}: ${JSON.stringify(dimensions)}`
}

async function expectActionOpens(target: Locator, action: () => Promise<void>) {
  await expect(async () => {
    if (!(await target.isVisible())) {
      await action()
    }
    await expect(target).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 10_000 })
}

async function expectSafeExternalLinks(page: Page, context: string) {
  const unsafeLinks = await page.locator("a[href]").evaluateAll((links) =>
    links.flatMap((link) => {
      const anchor = link as HTMLAnchorElement
      const url = new URL(anchor.href, window.location.href)
      if (
        !url.protocol.startsWith("http") ||
        url.origin === window.location.origin
      ) {
        return []
      }

      if (anchor.target !== "_blank") {
        return []
      }

      const rel = new Set(anchor.rel.split(/\s+/).filter(Boolean))
      return rel.has("noopener") && rel.has("noreferrer")
        ? []
        : [{ href: anchor.href, rel: anchor.rel, target: anchor.target }]
    }),
  )

  expect(unsafeLinks, context).toEqual([])
}

function skipUnlessProject(testInfo: TestInfo, projectName: string) {
  test.skip(
    testInfo.project.name !== projectName,
    `Runs once in the ${projectName} project.`,
  )
}

test.describe("public marketing and editorial routes", () => {
  test("states paid pricing without free-plan or free-trial claims", async ({
    page,
  }, testInfo) => {
    skipUnlessProject(testInfo, "chromium-light")
    await page.goto("/")

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Find the conversations that should shape your next move.",
      }),
    ).toBeVisible()
    await expect(
      page.getByText(
        "Paid plans start at $19/month. Every plan includes every feature.",
      ),
    ).toBeVisible()

    const pricing = page.locator("#pricing")
    await expect(
      pricing.getByRole("heading", {
        name: "Straightforward pricing. The full product on every plan.",
      }),
    ).toBeVisible()

    for (const plan of [
      { name: "Starter", price: "$19" },
      { name: "Growth", price: "$99" },
      { name: "Scale", price: "$199" },
    ]) {
      const planCard = pricing
        .getByRole("heading", { level: 3, name: plan.name })
        .locator("..")
      await expect(planCard).toContainText(plan.price)
      await expect(planCard).toContainText("/ month")
      await expect(
        planCard.getByRole("link", { name: `Choose ${plan.name}` }),
      ).toHaveAttribute("href", "/sign-up")
    }

    await expect(pricing).toContainText(
      "Every listed feature is included at every price point.",
    )
    await expect(pricing).toContainText("The complete Astreex feature set")

    const publicCopy = await page.locator("body").innerText()
    expect(publicCopy).not.toMatch(/\bfree(?:\s+(?:plan|tier|trial))?\b/i)
  })

  test("lists every field note and renders every complete article", async ({
    page,
  }, testInfo) => {
    skipUnlessProject(testInfo, "chromium-light")
    testInfo.setTimeout(60_000)
    await page.goto("/blog")

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Better systems for listening to customers.",
      }),
    ).toBeVisible()
    await expect(
      page.getByText("3 in-depth articles", { exact: true }),
    ).toBeVisible()

    const articleLinks = page.locator('main ol a[href^="/blog/"]')
    await expect(articleLinks).toHaveCount(expectedBlogPosts.length)
    expect(
      await articleLinks.evaluateAll((links) =>
        links.map((link) => link.getAttribute("href")),
      ),
    ).toEqual(expectedBlogPosts.map(({ slug }) => `/blog/${slug}`))

    for (const post of expectedBlogPosts) {
      await expect(
        page.getByRole("link", { name: new RegExp(post.title) }),
      ).toBeVisible()
      await page.goto(`/blog/${post.slug}`)

      await expect(
        page.getByRole("heading", { level: 1, name: post.title }),
      ).toBeVisible()
      await expect(page.locator("main article")).toBeVisible()
      await expect(page.locator("main article h2").first()).toBeVisible()
      await expect(
        page.getByRole("link", { name: "All field notes" }),
      ).toHaveAttribute("href", "/blog")
      await expect(
        page.getByRole("region", { name: "Scrollable data table" }).first(),
      ).toBeVisible()

      const structuredDataText = await page
        .locator('script[type="application/ld+json"]')
        .textContent()
      expect(structuredDataText).not.toBeNull()
      const structuredData = JSON.parse(structuredDataText ?? "{}") as {
        "@type"?: string
        headline?: string
        mainEntityOfPage?: string
      }
      expect(structuredData["@type"]).toBe("Article")
      expect(structuredData.headline).toBe(post.title)
      expect(
        new URL(structuredData.mainEntityOfPage ?? "https://invalid.example")
          .pathname,
      ).toBe(`/blog/${post.slug}`)
      await expectSafeExternalLinks(page, `/blog/${post.slug}`)
    }
  })

  test("keeps all current public external links safe", async ({
    page,
  }, testInfo) => {
    skipUnlessProject(testInfo, "chromium-light")
    testInfo.setTimeout(60_000)

    for (const route of [
      "/",
      "/blog",
      "/changelog",
      "/sign-in",
      "/sign-up",
      ...expectedBlogPosts.map(({ slug }) => `/blog/${slug}`),
    ]) {
      await page.goto(route)
      await expectSafeExternalLinks(page, route)
    }
  })
})

test.describe("credential-free authentication states", () => {
  test.skip(
    clerkConfigured,
    "Requires Clerk keys to be absent or invalid so the honest configuration state is rendered.",
  )

  for (const authRoute of [
    {
      path: "/sign-in",
      title: "Sign-in is not configured",
      description:
        "Astreex cannot show an authentication form or begin a session until valid Clerk publishable and server keys are present.",
    },
    {
      path: "/sign-up",
      title: "Account creation is not configured",
      description:
        "Astreex cannot show a registration form or create an identity until valid Clerk publishable and server keys are present.",
    },
  ] as const) {
    test(`${authRoute.path} explains missing authentication without fabricating an account flow`, async ({
      page,
    }, testInfo) => {
      skipUnlessProject(testInfo, "chromium-light")
      await page.goto(authRoute.path)

      await expect(
        page.getByRole("heading", { level: 2, name: authRoute.title }),
      ).toBeVisible()
      await expect(page.getByText(authRoute.description)).toBeVisible()
      await expect(
        page.getByText(
          "No identity, account, monitoring profile, or subscription has been created or inferred.",
        ),
      ).toBeVisible()
      await expect(
        page
          .getByRole("list", { name: "Configuration issues" })
          .locator("code"),
      ).toHaveText(clerkIssueVariables)
      await expect(page.locator("form")).toHaveCount(0)
      await expect(page.getByRole("textbox")).toHaveCount(0)
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        "content",
        /noindex/,
      )
    })
  }
})

test.describe("responsive themes, keyboard use, and accessibility", () => {
  test("keeps the 375px homepage responsive and accessible in light and dark mode", async ({
    page,
  }, testInfo) => {
    test.skip(
      !["chromium-light", "chromium-dark"].includes(testInfo.project.name),
      "Runs in the explicit light and dark Chromium projects.",
    )
    await page.setViewportSize({ width: 375, height: 900 })
    await page.goto("/")

    const overflow = await horizontalOverflowFailure(
      page,
      `/ at 375px in ${testInfo.project.name}`,
    )
    expect(overflow, overflow ?? undefined).toBeNull()
    await expect(
      page.getByLabel("Example monitoring configuration"),
    ).toBeVisible()
    await expectNoAccessibilityViolations(page)
  })

  test("renders an accessible light or dark homepage and supports keyboard navigation", async ({
    page,
  }, testInfo) => {
    test.skip(
      !["chromium-light", "chromium-dark"].includes(testInfo.project.name),
      "Runs in the explicit light and dark desktop projects.",
    )
    const expectedScheme = testInfo.project.name.endsWith("dark")
      ? "dark"
      : "light"

    await page.goto("/")
    await expect
      .poll(async () =>
        page
          .locator("html")
          .evaluate((element) => getComputedStyle(element).colorScheme),
      )
      .toBe(expectedScheme)
    await expect(page.locator("html")).toHaveClass(
      new RegExp(`(^|\\s)${expectedScheme}(\\s|$)`),
    )

    const palette = await page.locator("body").evaluate((element) => {
      const style = getComputedStyle(element)
      return { background: style.backgroundColor, foreground: style.color }
    })
    expect(palette.background).not.toBe(palette.foreground)
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Find the conversations that should shape your next move.",
      }),
    ).toBeVisible()

    const skipLink = page.getByRole("link", { name: "Skip to main content" })
    await skipLink.focus()
    await page.keyboard.press("Enter")
    await expect(page.locator("#main-content")).toBeFocused()

    const themeButton = page.getByRole("button", { name: "Change color theme" })
    const lightTheme = page.getByRole("menuitemradio", { name: "Light" })
    await expectActionOpens(lightTheme, async () => {
      await themeButton.focus()
      await page.keyboard.press("Enter")
    })
    await expect(
      page.getByRole("menuitemradio", { name: "Dark" }),
    ).toBeVisible()
    await expect(
      page.getByRole("menuitemradio", { name: "System" }),
    ).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(themeButton).toBeFocused()

    await expectNoAccessibilityViolations(page)
  })

  test("opens, closes, and follows the mobile navigation without losing focus", async ({
    page,
  }, testInfo) => {
    skipUnlessProject(testInfo, "mobile")
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto("/")

    await expect(
      page.getByRole("navigation", { name: "Primary navigation" }),
    ).not.toBeVisible()
    const trigger = page.getByRole("button", { name: /navigation/ })
    await expect(trigger).toHaveAttribute("aria-expanded", "false")

    const navigation = page.getByRole("navigation", {
      name: "Mobile navigation",
    })
    await expectActionOpens(navigation, () => trigger.click())
    await expect(trigger).toHaveAttribute("aria-expanded", "true")
    for (const linkName of [
      "Sources",
      "How it works",
      "Features",
      "Pricing",
      "Field notes",
      "Changelog",
      "FAQ",
      "Sign in",
      "Get started",
    ]) {
      await expect(
        navigation.getByRole("link", { name: linkName }),
      ).toBeVisible()
    }

    await page.keyboard.press("Escape")
    await expect(navigation).toHaveCount(0)
    await expect(
      page.getByRole("button", { name: "Open navigation" }),
    ).toBeFocused()

    await expectActionOpens(navigation, () =>
      page.getByRole("button", { name: "Open navigation" }).click(),
    )
    await navigation.getByRole("link", { name: "Pricing" }).click()
    await expect(page).toHaveURL(/\/#pricing$/)
    await expect(navigation).toHaveCount(0)
    await expect(page.locator("#pricing")).toBeVisible()
  })

  test("has no horizontal document overflow at 375, 768, or 1440 pixels", async ({
    page,
  }, testInfo) => {
    skipUnlessProject(testInfo, "chromium-light")
    testInfo.setTimeout(120_000)

    const overflowFailures: string[] = []

    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      for (const route of [
        "/",
        "/blog",
        "/blog/build-a-customer-keyword-strategy",
        "/sign-in",
        "/app",
      ]) {
        await page.goto(route)
        const failure = await horizontalOverflowFailure(
          page,
          `${route} at ${width}px`,
        )
        if (failure) overflowFailures.push(failure)
      }

      if (width < 1024) {
        await page.goto("/")
        await expect(
          page.getByRole("button", { name: "Open navigation" }),
        ).toBeVisible()
      } else {
        await page.goto("/")
        await expect(
          page.getByRole("navigation", { name: "Primary navigation" }),
        ).toBeVisible()
        await expect(
          page.getByRole("button", { name: "Open navigation" }),
        ).not.toBeVisible()
      }
    }

    expect(overflowFailures, overflowFailures.join("\n")).toEqual([])
  })
})
