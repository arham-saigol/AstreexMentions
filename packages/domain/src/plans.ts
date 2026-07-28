import { z } from "zod"

import { PLAN_IDS, planIdSchema, type PlanId } from "./enums"

export const planDefinitionSchema = z.strictObject({
  id: planIdSchema,
  name: z.string().min(1),
  priceUsd: z.number().int().positive(),
  monthlyMentionLimit: z.number().int().positive(),
  keywordLimit: z.number().int().positive(),
})

export type PlanDefinition = Readonly<z.infer<typeof planDefinitionSchema>>

export const PLANS = Object.freeze({
  starter: Object.freeze({
    id: "starter",
    name: "Starter",
    priceUsd: 19,
    monthlyMentionLimit: 2_000,
    keywordLimit: 3,
  }),
  growth: Object.freeze({
    id: "growth",
    name: "Growth",
    priceUsd: 99,
    monthlyMentionLimit: 20_000,
    keywordLimit: 6,
  }),
  scale: Object.freeze({
    id: "scale",
    name: "Scale",
    priceUsd: 199,
    monthlyMentionLimit: 50_000,
    keywordLimit: 10,
  }),
} satisfies Readonly<Record<PlanId, PlanDefinition>>)

export const PLAN_DEFINITIONS = Object.freeze(PLAN_IDS.map((id) => PLANS[id]))

export function getPlanDefinition(planId: PlanId): PlanDefinition {
  return PLANS[planId]
}

export function isWithinPlanMentionLimit(
  planId: PlanId,
  monthlyMentions: number,
): boolean {
  return (
    Number.isInteger(monthlyMentions) &&
    monthlyMentions >= 0 &&
    monthlyMentions <= PLANS[planId].monthlyMentionLimit
  )
}

export function isWithinPlanKeywordLimit(
  planId: PlanId,
  keywordCount: number,
): boolean {
  return (
    Number.isInteger(keywordCount) &&
    keywordCount >= 0 &&
    keywordCount <= PLANS[planId].keywordLimit
  )
}
