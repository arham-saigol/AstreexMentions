import type { PlanId } from "@astreex/domain"
import { describe, expect, it } from "vitest"

import {
  createDailyDigestCounts,
  dailyDigestSubject,
  renderDailyDigestEmail,
  type DailyDigestMention,
} from "./daily-digest"
import { limitReachedSubject, renderLimitReachedEmail } from "./limit-reached"
import { renderUsageWarningEmail, usageWarningSubject } from "./usage-warning"

const astreexUrl = "https://app.astreex.com/mentions?workspace=acme"

const planCases: readonly [PlanId, number, number, string, string][] = [
  ["starter", 19, 2_000, "3", "Starter"],
  ["growth", 99, 20_000, "6", "Growth"],
  ["scale", 199, 50_000, "10", "Scale"],
]

describe("usage emails", () => {
  it.each(planCases)(
    "renders the %s 80%% warning with exact plan details",
    async (planId, price, limit, keywords, name) => {
      const result = await renderUsageWarningEmail({
        astreexUrl,
        currentUsage: Math.ceil(limit * 0.8),
        planId,
        recipientName: "Morgan <Owner>",
        workspaceName: "Acme & Partners",
      })

      expect(result.subject).toBe(
        `Astreex usage alert: 80% of your ${name} limit used`,
      )
      expect(usageWarningSubject(planId)).toBe(result.subject)
      expect(result.html).toContain('lang="en"')
      expect(result.html).toContain('name="color-scheme"')
      expect(result.html).toContain("prefers-color-scheme: dark")
      expect(result.html).toContain("Morgan &lt;Owner&gt;")
      expect(result.html).toContain("Acme &amp; Partners")
      expect(result.text).toContain(`$${price}/month`)
      expect(result.text).toContain(limit.toLocaleString("en-US"))
      expect(result.text).toContain(`${keywords} keywords`)
      expect(result.html).toContain(
        `href="${astreexUrl.replace("&", "&amp;")}"`,
      )
      expect(result.html).not.toContain("gradient")
      expect(result.text).toContain(
        "YOU HAVE USED 80% OF YOUR MONTHLY MENTION LIMIT",
      )
      expect(result.text).toContain("Review usage in Astreex")
      expect(result.text).toContain(astreexUrl)
    },
  )

  it("renders a deterministic 100% limit-reached email", async () => {
    const props = {
      astreexUrl,
      currentUsage: 20_000,
      planId: "growth" as const,
      recipientName: "Avery",
      workspaceName: "Growth workspace",
    }
    const first = await renderLimitReachedEmail(props)
    const second = await renderLimitReachedEmail(props)

    expect(first).toEqual(second)
    expect(first.subject).toBe("Astreex limit reached: Growth monthly mentions")
    expect(limitReachedSubject("growth")).toBe(first.subject)
    expect(first.html).toContain("100% of monthly allowance used")
    expect(first.text).toContain("$99/month")
    expect(first.text).toContain("20,000 monthly mentions")
    expect(first.text).toContain("6 keywords")
    expect(first.text).toContain("Review plan in Astreex")
    expect(first.text).toContain(astreexUrl)
  })

  it("rejects usage values outside each notification state", async () => {
    await expect(
      renderUsageWarningEmail({
        astreexUrl,
        currentUsage: 1_599,
        planId: "starter",
      }),
    ).rejects.toThrow("currentUsage must be at least 1600")
    await expect(
      renderUsageWarningEmail({
        astreexUrl,
        currentUsage: 2_000,
        planId: "starter",
      }),
    ).rejects.toThrow("below 2000")
    await expect(
      renderLimitReachedEmail({
        astreexUrl,
        currentUsage: 49_999,
        planId: "scale",
      }),
    ).rejects.toThrow("at least 50000")
  })

  it("rejects unsafe Astreex links", async () => {
    await expect(
      renderLimitReachedEmail({
        astreexUrl: "javascript:alert(1)",
        currentUsage: 2_000,
        planId: "starter",
      }),
    ).rejects.toThrow("Astreex URL must use HTTP or HTTPS")
  })
})

const topMentions: readonly DailyDigestMention[] = [
  {
    author: "@provider <admin>",
    category: "Question",
    engagementScore: 42,
    excerpt: 'Could Astreex support <img src=x onerror="alert(1)">?',
    platform: "x",
    title: 'Launch <script>alert("x")</script> & feedback',
    url: "https://twitter.com/acme/status/123?utm_source=digest",
  },
  {
    category: "Praise",
    engagementScore: 21,
    platform: "reddit",
    title: "A useful monitoring workflow",
    url: "https://www.reddit.com/r/SaaS/comments/AbC123/a_post/?utm_medium=email#comments",
  },
  {
    category: "Other",
    engagementScore: 8,
    platform: "hacker_news",
    title: "Ask HN: mention monitoring",
    url: "http://news.ycombinator.com/item?id=789&utm_campaign=digest#reply",
  },
]

describe("daily digest email", () => {
  it("renders accessible counts, escaped provider content, and canonical links", async () => {
    const counts = createDailyDigestCounts(topMentions)
    const result = await renderDailyDigestEmail({
      astreexUrl,
      counts,
      localDate: "2026-07-25",
      recipientName: "Taylor <script>bad()</script>",
      topMentions,
      workspaceName: "Astreex <Team>",
    })

    expect(result.subject).toBe(
      "Astreex daily digest: 3 mentions for 2026-07-25",
    )
    expect(dailyDigestSubject("2026-07-25", 3)).toBe(result.subject)
    expect(result.html).toContain('lang="en"')
    expect(result.html).toContain("Mention counts by platform")
    expect(result.html).toContain("Mention counts by category")
    expect(result.text).toContain("* X: 1")
    expect(result.text).toContain("* Reddit: 1")
    expect(result.text).toContain("* Hacker News: 1")
    expect(result.text).toContain("* Question: 1")
    expect(result.text).toContain("* Praise: 1")
    expect(result.text).toContain("* Other: 1")
    expect(result.html).toContain(
      "Launch &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; feedback",
    )
    expect(result.html).toContain(
      "Could Astreex support &lt;img src=x onerror=&quot;alert(1)&quot;&gt;?",
    )
    expect(result.html).not.toContain('<script>alert("x")</script>')
    expect(result.html).not.toContain('<img src=x onerror="alert(1)">')
    expect(result.html).toContain('href="https://x.com/i/web/status/123"')
    expect(result.html).toContain(
      'href="https://www.reddit.com/r/saas/comments/abc123"',
    )
    expect(result.html).toContain(
      'href="https://news.ycombinator.com/item?id=789"',
    )
    expect(result.html).toContain(`href="${astreexUrl}"`)
    expect(result.html).not.toContain("utm_")
    expect(result.html).not.toContain("gradient")
    expect(result.text).toContain("3 mentions")
    expect(result.text).toContain(
      'LAUNCH <SCRIPT>ALERT("X")</SCRIPT> & FEEDBACK',
    )
    expect(result.text).toContain("https://x.com/i/web/status/123")
    expect(result.text).toContain(astreexUrl)
  })

  it("is deterministic for identical input", async () => {
    const props = {
      astreexUrl,
      counts: createDailyDigestCounts(topMentions),
      localDate: "2026-07-25",
      topMentions,
      workspaceName: "Astreex",
    }

    expect(await renderDailyDigestEmail(props)).toEqual(
      await renderDailyDigestEmail(props),
    )
  })

  it("validates digest dates, counts, and links", async () => {
    const counts = createDailyDigestCounts(topMentions)

    expect(() => dailyDigestSubject("2026-02-30", 3)).toThrow(
      "Invalid ISO date",
    )
    await expect(
      renderDailyDigestEmail({
        astreexUrl,
        counts: {
          ...counts,
          total: 4,
        },
        localDate: "2026-07-25",
        topMentions,
        workspaceName: "Astreex",
      }),
    ).rejects.toThrow("counts.total")
    await expect(
      renderDailyDigestEmail({
        astreexUrl,
        counts,
        localDate: "2026-07-25",
        topMentions: [
          {
            category: "Bug",
            platform: "x",
            title: "Unsafe provider URL",
            url: "javascript:alert(1)",
          },
        ],
        workspaceName: "Astreex",
      }),
    ).rejects.toThrow("Mention URL must use HTTP or HTTPS")
  })
})
