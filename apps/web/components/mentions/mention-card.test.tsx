// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { MentionCard } from "./mention-card"
import type { MentionItem } from "@/lib/mentions"

const mention: MentionItem = {
  analysisState: "completed",
  feedState: "visible",
  id: "mention_1" as MentionItem["id"],
  body: "A customer asked whether Astreex supports saved views.",
  canonicalUrl: "https://example.com/mention/1",
  engagementScore: 0,
  platform: "reddit",
  priority: "medium",
  publishedAt: 1_700_000_000_000,
  status: "new",
  matchedKeywords: [
    {
      id: "keyword_1" as MentionItem["matchedKeywords"][number]["id"],
      phrase: "Astreex",
    },
  ],
  category: {
    id: "category_question" as NonNullable<MentionItem["category"]>["id"],
    name: "Question",
    systemKey: "question",
  },
  authorDisplayName: "Customer",
}

afterEach(cleanup)

describe("MentionCard", () => {
  it("exposes reversible status actions and the canonical source link", () => {
    const onStatusChange = vi.fn()
    render(
      <MentionCard
        mention={mention}
        pending={false}
        onStatusChange={onStatusChange}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }))

    expect(onStatusChange).toHaveBeenNthCalledWith(1, "mention_1", "saved")
    expect(onStatusChange).toHaveBeenNthCalledWith(2, "mention_1", "dismissed")

    const sourceLink = screen.getByRole("link", {
      name: "Open mention on Reddit",
    })
    expect(sourceLink.getAttribute("href")).toBe(mention.canonicalUrl)
    expect(sourceLink.getAttribute("target")).toBe("_blank")
  })

  it("shows the analyzed priority with accessible text", () => {
    render(
      <MentionCard
        mention={{ ...mention, priority: "high" }}
        pending={false}
        onStatusChange={vi.fn()}
      />,
    )

    expect(screen.getByText("High priority")).toBeTruthy()
  })

  it("restores a filtered mention without showing status actions", () => {
    const onRestore = vi.fn()
    render(
      <MentionCard
        mention={{
          ...mention,
          feedState: "filtered",
          relevanceReason: "This refers to an unrelated meaning.",
        }}
        pending={false}
        onRestore={onRestore}
        onStatusChange={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Mark as relevant" }))
    expect(onRestore).toHaveBeenCalledWith("mention_1")
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Dismiss" })).toBeNull()
    expect(screen.getByText(/unrelated meaning/)).toBeTruthy()
  })

  it("uses a custom category's configured color family", () => {
    render(
      <MentionCard
        mention={{
          ...mention,
          category: {
            id: "category_custom" as NonNullable<MentionItem["category"]>["id"],
            name: "Pricing objection",
            colorToken: "purple",
          },
        }}
        pending={false}
        onStatusChange={vi.fn()}
      />,
    )

    expect(
      screen.getByText("Pricing objection").className.split(/\s+/),
    ).toContain("bg-competitor")
  })

  it("bounds long mention bodies to a feed preview", () => {
    render(
      <MentionCard
        mention={{ ...mention, body: "Long mention body" }}
        pending={false}
        onStatusChange={vi.fn()}
      />,
    )

    const bodyClasses = screen
      .getByText("Long mention body")
      .className.split(/\s+/)
    expect(bodyClasses).toContain("overflow-hidden")
    expect(bodyClasses).toContain("[-webkit-line-clamp:3]")
  })

  it("locks status actions while an optimistic update is pending", () => {
    render(
      <MentionCard
        mention={{ ...mention, status: "saved" }}
        pending
        onStatusChange={vi.fn()}
      />,
    )

    expect(
      (screen.getByRole("button", { name: "Unsave" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
    expect(
      (screen.getByRole("button", { name: "Dismiss" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
  })
})
