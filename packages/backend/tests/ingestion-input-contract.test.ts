import { describe, expect, it, vi } from "vitest"

import {
  assertPersistableSavedViewName,
  validateKeywordPlatforms,
} from "../convex/lib/customerInputContract"
import {
  buildMentionRediscoveryPatch,
  ingestMentionAtomically,
  resolveMentionDedupeIdentity,
} from "../convex/lib/mentionIngestion"

describe("customer input contract", () => {
  it("requires at least one unique supported keyword platform", () => {
    expect(validateKeywordPlatforms(["x", "reddit", "hacker_news"])).toEqual([
      "x",
      "reddit",
      "hacker_news",
    ])
    expect(() => validateKeywordPlatforms([])).toThrowError(
      "Select at least one keyword platform",
    )
    expect(() => validateKeywordPlatforms(["reddit", "reddit"])).toThrowError(
      "cannot contain duplicates",
    )
  })

  it("keeps All Mentions synthetic instead of storing it as a saved view", () => {
    expect(assertPersistableSavedViewName("Important bugs")).toBe(
      "Important bugs",
    )
    expect(() => assertPersistableSavedViewName(" all mentions ")).toThrowError(
      "synthetic view",
    )
  })
})

describe("atomic mention ingestion contract", () => {
  it("deduplicates within workspace, platform, and content type", () => {
    expect(
      resolveMentionDedupeIdentity({
        contentType: "comment",
        fallbackKey: "fallback-is-ignored",
        platform: "reddit",
        providerItemId: "comment-1",
        workspaceId: "workspace-1",
      }),
    ).toEqual({
      contentType: "comment",
      kind: "provider",
      platform: "reddit",
      providerItemId: "comment-1",
      workspaceId: "workspace-1",
    })
    expect(
      resolveMentionDedupeIdentity({
        contentType: "post",
        fallbackKey: "canonical-url-hash",
        platform: "reddit",
        workspaceId: "workspace-1",
      }),
    ).toMatchObject({
      contentType: "post",
      fallbackKey: "canonical-url-hash",
      kind: "fallback",
    })
    expect(() =>
      resolveMentionDedupeIdentity({
        contentType: "post",
        platform: "reddit",
        workspaceId: "workspace-1",
      }),
    ).toThrowError("providerItemId or fallbackKey")
  })

  it("builds a rediscovery patch containing metrics and timestamps only", () => {
    expect(
      buildMentionRediscoveryPatch(
        {
          commentCount: 4,
          engagementScore: 20,
          likeCount: 10,
          replyCount: 2,
        },
        200,
      ),
    ).toEqual({
      commentCount: 4,
      engagementScore: 20,
      lastMatchedAt: 200,
      likeCount: 10,
      replyCount: 2,
      updatedAt: 200,
    })
  })

  it("updates only metrics when an indexed identity is rediscovered", async () => {
    const patch = vi.fn().mockResolvedValue(undefined)
    const insert = vi.fn().mockResolvedValue("mention-new")
    const store = {
      findByFallbackIdentity: vi.fn().mockResolvedValue(null),
      findByProviderIdentity: vi.fn().mockResolvedValue({ id: "mention-1" }),
      insert,
      patch,
    }

    await expect(
      ingestMentionAtomically(store, {
        create: {
          analysisState: "pending",
          body: "new body must not overwrite",
          categoryId: "category-new",
          status: "new",
        },
        identity: {
          contentType: "post",
          platform: "x",
          providerItemId: "post-1",
          workspaceId: "workspace-1",
        },
        metrics: { engagementScore: 12, likeCount: 5 },
        now: 500,
      }),
    ).resolves.toEqual({ kind: "rediscovered", mentionId: "mention-1" })

    expect(insert).not.toHaveBeenCalled()
    expect(patch).toHaveBeenCalledWith("mention-1", {
      engagementScore: 12,
      lastMatchedAt: 500,
      likeCount: 5,
      updatedAt: 500,
    })
  })
})
