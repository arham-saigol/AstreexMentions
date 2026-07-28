import { z } from "zod"

import {
  MENTION_CATEGORIES,
  mentionCategorySchema,
  type MentionCategory,
} from "./enums"

export const categoryColorSchema = z.string().regex(/^#[0-9A-F]{6}$/)

export const defaultCategorySchema = z.strictObject({
  name: mentionCategorySchema,
  description: z.string().min(1),
  color: categoryColorSchema,
  permanent: z.boolean(),
})

export type DefaultCategory = Readonly<z.infer<typeof defaultCategorySchema>>

export const DEFAULT_CATEGORIES = Object.freeze([
  Object.freeze({
    name: "Question",
    description: "A question or request for information, guidance, or help.",
    color: "#2563EB",
    permanent: false,
  }),
  Object.freeze({
    name: "Complaint",
    description:
      "Negative feedback or dissatisfaction with a product or experience.",
    color: "#DC2626",
    permanent: false,
  }),
  Object.freeze({
    name: "Praise",
    description: "Positive feedback, recommendation, or appreciation.",
    color: "#16A34A",
    permanent: false,
  }),
  Object.freeze({
    name: "Bug",
    description: "A report of broken, incorrect, or unexpected behavior.",
    color: "#EA580C",
    permanent: false,
  }),
  Object.freeze({
    name: "Feature Request",
    description: "A suggestion for a new capability or product improvement.",
    color: "#7C3AED",
    permanent: false,
  }),
  Object.freeze({
    name: "Competitor Mention",
    description: "A comparison with or reference to a competing product.",
    color: "#0891B2",
    permanent: false,
  }),
  Object.freeze({
    name: "Other",
    description: "A mention that does not fit another category.",
    color: "#64748B",
    permanent: true,
  }),
] satisfies readonly DefaultCategory[])

const categoryByName = new Map(
  DEFAULT_CATEGORIES.map((category) => [category.name, category]),
)

export function getDefaultCategory(name: MentionCategory): DefaultCategory {
  const category = categoryByName.get(name)
  if (!category) {
    throw new TypeError(`Unknown mention category: ${name}`)
  }
  return category
}

export function isPermanentCategory(name: MentionCategory): boolean {
  return name === "Other"
}

export function assertDefaultCategoryCatalog(
  categories: readonly DefaultCategory[],
): void {
  const parsed = z.array(defaultCategorySchema).parse(categories)
  if (
    parsed.length !== MENTION_CATEGORIES.length ||
    parsed.some(
      (category, index) => category.name !== MENTION_CATEGORIES[index],
    ) ||
    parsed.some(
      (category) => category.permanent !== (category.name === "Other"),
    )
  ) {
    throw new TypeError(
      "Category catalog must contain the fixed taxonomy in product order with Other permanent",
    )
  }
}
