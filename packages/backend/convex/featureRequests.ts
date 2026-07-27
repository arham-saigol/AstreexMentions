import type { GenericId } from "convex/values"
import { ConvexError, v } from "convex/values"

import { authenticatedMutation, authenticatedQuery } from "./lib/authorization"
import { indexEquals } from "./server"
import { resolveCurrentCustomer } from "./users"

const MAX_TITLE_LENGTH = 120
const MAX_BODY_LENGTH = 2_000
const MAX_CUSTOMER_FEATURE_REQUESTS = 100

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

function featureRequestSearchText(input: {
  body: string
  requestId?: FeatureRequestId | undefined
  title: string
  user: Record<string, unknown>
  workspace: Record<string, unknown>
}): string {
  return [
    input.requestId,
    input.title,
    input.body,
    input.user._id,
    input.user.clerkUserId,
    input.user.name,
    input.user.email,
    input.workspace._id,
    input.workspace.name,
    input.workspace.slug,
  ]
    .filter(
      (value): value is string =>
        typeof value === "string" && value.trim().length > 0,
    )
    .join("\n")
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
    const title = validatedTitle(args.title)
    const body = validatedBody(args.description)
    const now = Date.now()
    const requestId = (await ctx.db.insert("featureRequests", {
      body,
      createdAt: now,
      createdByUserId: viewer.id,
      searchText: featureRequestSearchText({
        body,
        title,
        user: viewer,
        workspace,
      }),
      status: "new",
      title,
      updatedAt: now,
      workspaceId: workspace.id,
    })) as FeatureRequestId
    await ctx.db.patch("featureRequests", requestId, {
      searchText: featureRequestSearchText({
        body,
        requestId,
        title,
        user: viewer,
        workspace,
      }),
    })

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
      .withIndex("by_workspace_creator_and_created_at", (q) =>
        indexEquals(
          q,
          ["workspaceId", workspace.id],
          ["createdByUserId", viewer.id],
        ),
      )
      .order("desc")
      .take(MAX_CUSTOMER_FEATURE_REQUESTS)

    return rows.map((row) => publicFeatureRequest(row))
  },
})
