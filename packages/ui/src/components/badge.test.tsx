import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import {
  CategoryBadge,
  mentionCategoryVariants,
  type MentionCategory,
} from "./badge"

const categories = [
  "Question",
  "Complaint",
  "Praise",
  "Bug",
  "Feature Request",
  "Competitor Mention",
  "Other",
] as const satisfies readonly MentionCategory[]

describe("CategoryBadge", () => {
  it.each(categories)("renders the curated %s category", (category) => {
    render(<CategoryBadge category={category} />)

    expect(screen.getByText(category)).toHaveClass(
      `bg-${mentionCategoryVariants[category]}`,
    )
  })

  it("keeps Other in the permanent category set", () => {
    expect(categories.at(-1)).toBe("Other")
    expect(mentionCategoryVariants.Other).toBe("other")
  })
})
