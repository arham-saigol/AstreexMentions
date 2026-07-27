import type { GenericId } from "convex/values"
import { ConvexError, v } from "convex/values"

import { authenticatedMutation, authenticatedQuery } from "./lib/authorization"
import { resolveCurrentCustomer } from "./users"

const MAX_TITLE_LENGTH = 120
const MAX_BODY_LENGTH = 2_000

const featureRequestStatusValidator = v.union(
  v.literal("new"),
  v.literal("planned"),
  v.literal("in_progress"),
  v.literal("completed"),
  v.literal("declined"),
)

const featureRequestResultValidator = v.object({
  body: v.string(),
  createdAt: v.number(),
  id: v.id("featureRequests"),
  status: featureRequestStatusValidator,
  title: v.string(),
  updatedAt: v.number(),
})

type FeatureRequestId = GenericId<"featureRequests">

type FeatureRequestStatus =
  "new" | "planned" | "in_progress" | "completed" | "declined"

function featureRequestError(code: string, message: string): never {
  throw new ConvexError({ code, message })
}

function validatedTitle(value: string): string {
  const title = value.trim().replace(/\s+/g, " ")
  if (title.length < 3 || title.length > MAX_TITLE_LENGTH) {
    featureRequestError(
      "INVALID_FEATURE_REQUEST",
      `Feature request titles must contain 3 to ${MAX_TITLE_LENGTH} characters`,
    )
  }
  return title
}

function validatedBody(value: string): string {
  const body = value.trim()
  if (body.length < 10 || body.length > MAX_BODY_LENGTH) {
    featureRequestError(
      "INVALID_FEATURE_REQUEST",
      `Feature request descriptions must contain 10 to ${MAX_BODY_LENGTH} characters`,
    )
  }
  return body
}

function publicFeatureRequest(row: Record<string, unknown>) {
  return {
    body: row.body as string,
    createdAt: row.createdAt as number,
    id: row._id as FeatureRequestId,
    status: row.status as FeatureRequestStatus,
    title: row.title as string,
    updatedAt: row.updatedAt as number,
  }
}

export const createFeatureRequest = authenticatedMutation({
  args: {
    description: v.string(),
    title: v.string(),
  },
  returns: v.object({ id: v.id("featureRequests") }),
  handler: async (ctx, args) => {
    const { viewer, workspace } = await resolveCurrentCustomer(
      ctx,
      ctx.identity,
    )
    const now = Date.now()
    const requestId = (await ctx.db.insert("featureRequests", {
      body: validatedBody(args.description),
      createdAt: now,
      createdByUserId: viewer.id,
      status: "new",
      title: validatedTitle(args.title),
      updatedAt: now,
      workspaceId: workspace.id,
    })) as FeatureRequestId

    return { id: requestId }
  },
})

export const listMyFeatureRequests = authenticatedQuery({
  args: {},
  returns: v.array(featureRequestResultValidator),
  handler: async (ctx) => {
    const { viewer, workspace } = await resolveCurrentCustomer(
      ctx,
      ctx.identity,
    )
    const rows = await ctx.db
      .query("featureRequests")
      .withIndex("by_creator_and_created_at", (q) =>
        q.eq("createdByUserId", viewer.id),
      )
      .order("desc")
      .collect()

    return rows
      .filter((row) => row.workspaceId === workspace.id)
      .map((row) => publicFeatureRequest(row))
  },
})
