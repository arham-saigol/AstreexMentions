// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { MentionCard } from "./mention-card"
import type { MentionItem } from "@/lib/mentions"

const mention: MentionItem = {
  id: "mention_1" as MentionItem["id"],
  body: "A customer asked whether Astreex supports saved views.",
  canonicalUrl: "https://example.com/mention/1",
  engagementScore: 0,
  platform: "reddit",
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
