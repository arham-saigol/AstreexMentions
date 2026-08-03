/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";
import type { GenericId as Id } from "convex/values";

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: {
  admin: {
    cancelDeletionJob: FunctionReference<
      "mutation",
      "public",
      { confirmation: string; deletionJobId: Id<"deletionJobs"> },
      {
        attempts: number;
        billingGuardStatus: string;
        completedAt?: number;
        createdAt: number;
        dataDeletionVerifiedAt?: number;
        generation?: number;
        id: Id<"deletionJobs">;
        identityDeletionVerifiedAt?: number;
        lastErrorCode?: string;
        leaseExpiresAt?: number;
        maxAttempts: number;
        nextAttemptAt?: number;
        operationId?: string;
        phase?: string;
        purgeStage?: string;
        quiescedAt?: number;
        scheduledAt: number;
        securityFenceExpiresAt?: number;
        status:
          | "pending"
          | "billing_check"
          | "blocked"
          | "leased"
          | "running"
          | "completed"
          | "failed"
          | "dead"
          | "canceled";
        supersedesJobId?: Id<"deletionJobs">;
        updatedAt: number;
        workflowVersion?: number;
        workspaceId: Id<"workspaces">;
      }
    >;
    createChangelogEntry: FunctionReference<
      "mutation",
      "public",
      {
        body: string;
        label?: string;
        publishedAt: number;
        slug: string;
        summary: string;
        title: string;
      },
      {
        body: string;
        id: Id<"changelogEntries">;
        label?: string;
        publishedAt?: number;
        slug: string;
        status: "draft" | "published";
        summary: string;
        title: string;
        updatedAt: number;
      }
    >;
    deleteChangelogEntry: FunctionReference<
      "mutation",
      "public",
      { entryId: Id<"changelogEntries"> },
      { id: Id<"changelogEntries"> }
    >;
    getDeletionJob: FunctionReference<
      "query",
      "public",
      { deletionJobId: Id<"deletionJobs"> },
      {
        events: Array<{
          action: string;
          createdAt: number;
          metadataJson?: string;
          outcome: "success" | "denied" | "failure";
        }>;
        job: {
          attempts: number;
          billingGuardStatus: string;
          completedAt?: number;
          createdAt: number;
          dataDeletionVerifiedAt?: number;
          generation?: number;
          id: Id<"deletionJobs">;
          identityDeletionVerifiedAt?: number;
          lastErrorCode?: string;
          leaseExpiresAt?: number;
          maxAttempts: number;
          nextAttemptAt?: number;
          operationId?: string;
          phase?: string;
          purgeStage?: string;
          quiescedAt?: number;
          scheduledAt: number;
          securityFenceExpiresAt?: number;
          status:
            | "pending"
            | "billing_check"
            | "blocked"
            | "leased"
            | "running"
            | "completed"
            | "failed"
            | "dead"
            | "canceled";
          supersedesJobId?: Id<"deletionJobs">;
          updatedAt: number;
          workflowVersion?: number;
          workspaceId: Id<"workspaces">;
        };
      }
    >;
    getMetricsOverview: FunctionReference<
      "query",
      "public",
      { days: 7 | 30 | 90; endAt: number },
      {
        categorization: {
          completed: number;
          failed: number;
          leased: number;
          pending: number;
          total: number;
        };
        categoryBreakdown: Array<{ category: string; count: number }>;
        digestDelivery: {
          bounced: number;
          clicked: number;
          complained: number;
          delivered: number;
          deliveryDelayed: number;
          failed: number;
          opened: number;
          scheduled: number;
          sent: number;
          suppressed: number;
          total: number;
        };
        mentionVolume: Array<{ count: number; timestamp: number }>;
        mentions: {
          byPlatform: Array<{
            count: number;
            platform: "x" | "reddit" | "hacker_news";
          }>;
          last30Days: number;
          today: number;
        };
        providerHealth: Array<{
          averageLatencyMs: number;
          failureCount: number;
          inputItemCount: number;
          maxLatencyMs: number;
          outputItemCount: number;
          provider: string;
          rateLimitedCount: number;
          requestCount: number;
          retryCount: number;
          successCount: number;
        }>;
        range: { days: 7 | 30 | 90; endAt: number; startAt: number };
        stats: {
          activeWorkspaces: number;
          emailsDelivered: number;
          mentions: number;
          workspaces: number;
        };
        subscriptionsByPlan: Array<{
          activeCount: number;
          count: number;
          planId: "starter" | "growth" | "scale";
        }>;
        usagePausedWorkspaces: number;
      }
    >;
    listChangelogEntries: FunctionReference<
      "query",
      "public",
      { cursor?: string; status?: "draft" | "published" },
      {
        items: Array<{
          body: string;
          id: Id<"changelogEntries">;
          label?: string;
          publishedAt?: number;
          slug: string;
          status: "draft" | "published";
          summary: string;
          title: string;
          updatedAt: number;
        }>;
        nextCursor?: string;
      }
    >;
    listDeletionJobs: FunctionReference<
      "query",
      "public",
      {
        limit?: number;
        status?:
          | "pending"
          | "billing_check"
          | "blocked"
          | "leased"
          | "running"
          | "completed"
          | "failed"
          | "dead"
          | "canceled";
      },
      Array<{
        attempts: number;
        billingGuardStatus: string;
        completedAt?: number;
        createdAt: number;
        dataDeletionVerifiedAt?: number;
        generation?: number;
        id: Id<"deletionJobs">;
        identityDeletionVerifiedAt?: number;
        lastErrorCode?: string;
        leaseExpiresAt?: number;
        maxAttempts: number;
        nextAttemptAt?: number;
        operationId?: string;
        phase?: string;
        purgeStage?: string;
        quiescedAt?: number;
        scheduledAt: number;
        securityFenceExpiresAt?: number;
        status:
          | "pending"
          | "billing_check"
          | "blocked"
          | "leased"
          | "running"
          | "completed"
          | "failed"
          | "dead"
          | "canceled";
        supersedesJobId?: Id<"deletionJobs">;
        updatedAt: number;
        workflowVersion?: number;
        workspaceId: Id<"workspaces">;
      }>
    >;
    listFeatureRequests: FunctionReference<
      "query",
      "public",
      {
        cursor?: string;
        limit?: number;
        query?: string;
        sort?: "newest" | "oldest";
        status?: "new" | "planned" | "in_progress" | "completed" | "declined";
      },
      {
        items: Array<{
          adminNote?: string;
          body: string;
          createdAt: number;
          id: Id<"featureRequests">;
          status: "new" | "planned" | "in_progress" | "completed" | "declined";
          title: string;
          updatedAt: number;
          user: {
            clerkUserId: string;
            email?: string;
            id: Id<"users">;
            name?: string;
          } | null;
          workspace: { id: Id<"workspaces">; name: string } | null;
        }>;
        nextCursor?: string;
      }
    >;
    publishChangelogEntry: FunctionReference<
      "mutation",
      "public",
      { entryId: Id<"changelogEntries"> },
      {
        body: string;
        id: Id<"changelogEntries">;
        label?: string;
        publishedAt?: number;
        slug: string;
        status: "draft" | "published";
        summary: string;
        title: string;
        updatedAt: number;
      }
    >;
    retryDeletionJob: FunctionReference<
      "mutation",
      "public",
      { confirmation: string; deletionJobId: Id<"deletionJobs"> },
      {
        attempts: number;
        billingGuardStatus: string;
        completedAt?: number;
        createdAt: number;
        dataDeletionVerifiedAt?: number;
        generation?: number;
        id: Id<"deletionJobs">;
        identityDeletionVerifiedAt?: number;
        lastErrorCode?: string;
        leaseExpiresAt?: number;
        maxAttempts: number;
        nextAttemptAt?: number;
        operationId?: string;
        phase?: string;
        purgeStage?: string;
        quiescedAt?: number;
        scheduledAt: number;
        securityFenceExpiresAt?: number;
        status:
          | "pending"
          | "billing_check"
          | "blocked"
          | "leased"
          | "running"
          | "completed"
          | "failed"
          | "dead"
          | "canceled";
        supersedesJobId?: Id<"deletionJobs">;
        updatedAt: number;
        workflowVersion?: number;
        workspaceId: Id<"workspaces">;
      }
    >;
    unpublishChangelogEntry: FunctionReference<
      "mutation",
      "public",
      { entryId: Id<"changelogEntries"> },
      {
        body: string;
        id: Id<"changelogEntries">;
        label?: string;
        publishedAt?: number;
        slug: string;
        status: "draft" | "published";
        summary: string;
        title: string;
        updatedAt: number;
      }
    >;
    updateChangelogEntry: FunctionReference<
      "mutation",
      "public",
      {
        body: string;
        entryId: Id<"changelogEntries">;
        label: string;
        publishedAt: number;
        slug: string;
        summary: string;
        title: string;
      },
      {
        body: string;
        id: Id<"changelogEntries">;
        label?: string;
        publishedAt?: number;
        slug: string;
        status: "draft" | "published";
        summary: string;
        title: string;
        updatedAt: number;
      }
    >;
    updateFeatureRequest: FunctionReference<
      "mutation",
      "public",
      {
        adminNote?: string;
        requestId: Id<"featureRequests">;
        status: "new" | "planned" | "in_progress" | "completed" | "declined";
      },
      {
        adminNote?: string;
        body: string;
        createdAt: number;
        id: Id<"featureRequests">;
        status: "new" | "planned" | "in_progress" | "completed" | "declined";
        title: string;
        updatedAt: number;
        user: {
          clerkUserId: string;
          email?: string;
          id: Id<"users">;
          name?: string;
        } | null;
        workspace: { id: Id<"workspaces">; name: string } | null;
      }
    >;
  };
  billing: {
    customer: {
      createBillingPortal: FunctionReference<
        "action",
        "public",
        {},
        | { missing: Array<string>; state: "provider_unconfigured" }
        | { state: "configured"; url: string }
      >;
      createCheckout: FunctionReference<
        "action",
        "public",
        { idempotencyKey: string; planId: "starter" | "growth" | "scale" },
        | { missing: Array<string>; state: "provider_unconfigured" }
        | {
            checkoutId: string;
            reused: boolean;
            state: "configured";
            status: string;
            url: string;
          }
      >;
      getBillingOverview: FunctionReference<
        "query",
        "public",
        { now: number },
        {
          missing?: Array<string>;
          providerState: "configured" | "provider_unconfigured";
          subscription: {
            cancelAtPeriodEnd: boolean;
            currentPeriodEnd: number;
            currentPeriodStart: number;
            entitlementStatus: "active" | "inactive";
            planId: "starter" | "growth" | "scale";
            status: string;
          } | null;
          usage: {
            keywordLimit: number;
            mentionLimit: number;
            mentionsUsed: number;
            periodEndAt: number;
            periodStartAt: number;
          } | null;
        }
      >;
      upgradeSubscription: FunctionReference<
        "action",
        "public",
        { planId: "starter" | "growth" | "scale" },
        | { missing: Array<string>; state: "provider_unconfigured" }
        | {
            kind: string;
            planId: "starter" | "growth" | "scale";
            state: "configured";
          }
      >;
    };
  };
  categories: {
    createCategory: FunctionReference<
      "mutation",
      "public",
      {
        colorToken:
          | "blue"
          | "orange"
          | "green"
          | "red"
          | "purple"
          | "yellow"
          | "gray"
          | "pink"
          | "cyan"
          | "slate";
        description: string;
        name: string;
      },
      {
        colorToken:
          | "blue"
          | "orange"
          | "green"
          | "red"
          | "purple"
          | "yellow"
          | "gray"
          | "pink"
          | "cyan"
          | "slate";
        description: string;
        enabled: boolean;
        id: Id<"categories">;
        isSystem: boolean;
        name: string;
        sortOrder: number;
        systemKey?:
          | "question"
          | "complaint"
          | "praise"
          | "bug"
          | "feature_request"
          | "competitor_mention"
          | "other";
      }
    >;
    deleteCategory: FunctionReference<
      "mutation",
      "public",
      { categoryId: Id<"categories"> },
      { state: "accepted" }
    >;
    listCategories: FunctionReference<
      "query",
      "public",
      {},
      Array<{
        colorToken:
          | "blue"
          | "orange"
          | "green"
          | "red"
          | "purple"
          | "yellow"
          | "gray"
          | "pink"
          | "cyan"
          | "slate";
        description: string;
        enabled: boolean;
        id: Id<"categories">;
        isSystem: boolean;
        name: string;
        sortOrder: number;
        systemKey?:
          | "question"
          | "complaint"
          | "praise"
          | "bug"
          | "feature_request"
          | "competitor_mention"
          | "other";
      }>
    >;
    updateCategory: FunctionReference<
      "mutation",
      "public",
      {
        categoryId: Id<"categories">;
        colorToken?:
          | "blue"
          | "orange"
          | "green"
          | "red"
          | "purple"
          | "yellow"
          | "gray"
          | "pink"
          | "cyan"
          | "slate";
        description?: string;
        enabled?: boolean;
        name?: string;
      },
      {
        colorToken:
          | "blue"
          | "orange"
          | "green"
          | "red"
          | "purple"
          | "yellow"
          | "gray"
          | "pink"
          | "cyan"
          | "slate";
        description: string;
        enabled: boolean;
        id: Id<"categories">;
        isSystem: boolean;
        name: string;
        sortOrder: number;
        systemKey?:
          | "question"
          | "complaint"
          | "praise"
          | "bug"
          | "feature_request"
          | "competitor_mention"
          | "other";
      }
    >;
  };
  changelog: {
    getPublishedEntry: FunctionReference<
      "query",
      "public",
      { slug: string },
      {
        body: string;
        publishedAt: number;
        slug: string;
        summary: string;
        title: string;
        updatedAt: number;
      } | null
    >;
    listPublishedEntries: FunctionReference<
      "query",
      "public",
      { cursor?: string },
      {
        entries: Array<{
          publishedAt: number;
          slug: string;
          summary: string;
          title: string;
          updatedAt: number;
        }>;
        isDone: boolean;
        nextCursor: string | null;
      }
    >;
  };
  digest: {
    customer: {
      getDailyDigestPreference: FunctionReference<
        "query",
        "public",
        {},
        {
          enabled: boolean;
          hour: number;
          mentionLimit: number;
          minute: number;
          nextRunAt: number;
          timeZone: string;
        }
      >;
      updateDailyDigestPreference: FunctionReference<
        "mutation",
        "public",
        {
          enabled: boolean;
          hour: number;
          mentionLimit: number;
          minute: number;
          timeZone: string;
        },
        {
          enabled: boolean;
          hour: number;
          mentionLimit: number;
          minute: number;
          nextRunAt: number;
          timeZone: string;
          updatedAt: number;
        }
      >;
    };
  };
  featureRequests: {
    createFeatureRequest: FunctionReference<
      "mutation",
      "public",
      { description: string; title: string },
      { id: Id<"featureRequests"> }
    >;
    listMyFeatureRequests: FunctionReference<
      "query",
      "public",
      {},
      Array<{
        body: string;
        createdAt: number;
        id: Id<"featureRequests">;
        status: "new" | "planned" | "in_progress" | "completed" | "declined";
        title: string;
        updatedAt: number;
      }>
    >;
  };
  keywords: {
    createKeyword: FunctionReference<
      "mutation",
      "public",
      { phrase: string; platforms: Array<"x" | "reddit" | "hacker_news"> },
      {
        createdAt: number;
        id: Id<"keywords">;
        pausedAt: number | null;
        phrase: string;
        platforms: Array<"x" | "reddit" | "hacker_news">;
        sources: Array<{
          id: Id<"trackingSources">;
          intervalMs: number;
          lastCheckedAt: number | null;
          lastError: string | null;
          nextExpectedAt: number | null;
          pauseReason: "paid" | "user" | "usage" | "config" | null;
          sourceType: "x" | "reddit_posts" | "reddit_comments" | "hacker_news";
          status: "active" | "paused" | "error" | "deleted";
        }>;
        status: "active" | "paused" | "deleted";
        updatedAt: number;
      }
    >;
    deleteKeyword: FunctionReference<
      "mutation",
      "public",
      { keywordId: Id<"keywords"> },
      { id: Id<"keywords">; status: "deleted" }
    >;
    getKeywordSummary: FunctionReference<
      "query",
      "public",
      { now: number },
      {
        activeCount: number;
        canCreate: boolean;
        count: number;
        limit: number;
        limitReached: boolean;
        monitoringState:
          "active" | "paused" | "setup_required" | "unpaid" | "usage_limited";
        pausedCount: number;
        remaining: number;
      }
    >;
    listKeywords: FunctionReference<
      "query",
      "public",
      {},
      Array<{
        createdAt: number;
        id: Id<"keywords">;
        pausedAt: number | null;
        phrase: string;
        platforms: Array<"x" | "reddit" | "hacker_news">;
        sources: Array<{
          id: Id<"trackingSources">;
          intervalMs: number;
          lastCheckedAt: number | null;
          lastError: string | null;
          nextExpectedAt: number | null;
          pauseReason: "paid" | "user" | "usage" | "config" | null;
          sourceType: "x" | "reddit_posts" | "reddit_comments" | "hacker_news";
          status: "active" | "paused" | "error" | "deleted";
        }>;
        status: "active" | "paused" | "deleted";
        updatedAt: number;
      }>
    >;
    pauseKeyword: FunctionReference<
      "mutation",
      "public",
      { keywordId: Id<"keywords"> },
      {
        createdAt: number;
        id: Id<"keywords">;
        pausedAt: number | null;
        phrase: string;
        platforms: Array<"x" | "reddit" | "hacker_news">;
        sources: Array<{
          id: Id<"trackingSources">;
          intervalMs: number;
          lastCheckedAt: number | null;
          lastError: string | null;
          nextExpectedAt: number | null;
          pauseReason: "paid" | "user" | "usage" | "config" | null;
          sourceType: "x" | "reddit_posts" | "reddit_comments" | "hacker_news";
          status: "active" | "paused" | "error" | "deleted";
        }>;
        status: "active" | "paused" | "deleted";
        updatedAt: number;
      }
    >;
    resumeKeyword: FunctionReference<
      "mutation",
      "public",
      { keywordId: Id<"keywords"> },
      {
        createdAt: number;
        id: Id<"keywords">;
        pausedAt: number | null;
        phrase: string;
        platforms: Array<"x" | "reddit" | "hacker_news">;
        sources: Array<{
          id: Id<"trackingSources">;
          intervalMs: number;
          lastCheckedAt: number | null;
          lastError: string | null;
          nextExpectedAt: number | null;
          pauseReason: "paid" | "user" | "usage" | "config" | null;
          sourceType: "x" | "reddit_posts" | "reddit_comments" | "hacker_news";
          status: "active" | "paused" | "error" | "deleted";
        }>;
        status: "active" | "paused" | "deleted";
        updatedAt: number;
      }
    >;
    updateKeyword: FunctionReference<
      "mutation",
      "public",
      {
        keywordId: Id<"keywords">;
        phrase: string;
        platforms: Array<"x" | "reddit" | "hacker_news">;
      },
      {
        createdAt: number;
        id: Id<"keywords">;
        pausedAt: number | null;
        phrase: string;
        platforms: Array<"x" | "reddit" | "hacker_news">;
        sources: Array<{
          id: Id<"trackingSources">;
          intervalMs: number;
          lastCheckedAt: number | null;
          lastError: string | null;
          nextExpectedAt: number | null;
          pauseReason: "paid" | "user" | "usage" | "config" | null;
          sourceType: "x" | "reddit_posts" | "reddit_comments" | "hacker_news";
          status: "active" | "paused" | "error" | "deleted";
        }>;
        status: "active" | "paused" | "deleted";
        updatedAt: number;
      }
    >;
  };
  mentions: {
    getMention: FunctionReference<
      "query",
      "public",
      { mentionId: Id<"mentions"> },
      {
        authorDisplayName?: string;
        authorHandle?: string;
        body: string;
        canonicalUrl: string;
        category: {
          colorToken?: string;
          id: Id<"categories">;
          name: string;
          systemKey?: string;
        } | null;
        commentCount?: number;
        engagementScore: number;
        id: Id<"mentions">;
        likeCount?: number;
        matchedKeywords: Array<{ id: Id<"keywords">; phrase: string }>;
        platform: "x" | "reddit" | "hacker_news";
        pointCount?: number;
        publishedAt: number;
        replyCount?: number;
        repostCount?: number;
        status: "new" | "saved" | "dismissed";
        title?: string;
      }
    >;
    listMentions: FunctionReference<
      "query",
      "public",
      {
        cursor?: string;
        filters?: {
          categoryIds?: Array<Id<"categories">>;
          keywordIds?: Array<Id<"keywords">>;
          mentionStatuses?: Array<"new" | "saved" | "dismissed">;
          platforms?: Array<"x" | "reddit" | "hacker_news">;
          publishedAfter?: number;
          publishedBefore?: number;
        };
        limit?: number;
        now: number;
        query?: string;
        sort?: "newest" | "oldest" | "most_engaged";
      },
      {
        isDone: boolean;
        items: Array<{
          authorDisplayName?: string;
          authorHandle?: string;
          body: string;
          canonicalUrl: string;
          category: {
            colorToken?: string;
            id: Id<"categories">;
            name: string;
            systemKey?: string;
          } | null;
          commentCount?: number;
          engagementScore: number;
          id: Id<"mentions">;
          likeCount?: number;
          matchedKeywords: Array<{ id: Id<"keywords">; phrase: string }>;
          platform: "x" | "reddit" | "hacker_news";
          pointCount?: number;
          publishedAt: number;
          replyCount?: number;
          repostCount?: number;
          status: "new" | "saved" | "dismissed";
          title?: string;
        }>;
        monitoringState:
          "active" | "paused" | "setup_required" | "usage_limited";
        nextCursor: string | null;
        totalCount?: number;
      }
    >;
    updateMentionStatus: FunctionReference<
      "mutation",
      "public",
      { mentionId: Id<"mentions">; status: "new" | "saved" | "dismissed" },
      {
        authorDisplayName?: string;
        authorHandle?: string;
        body: string;
        canonicalUrl: string;
        category: {
          colorToken?: string;
          id: Id<"categories">;
          name: string;
          systemKey?: string;
        } | null;
        commentCount?: number;
        engagementScore: number;
        id: Id<"mentions">;
        likeCount?: number;
        matchedKeywords: Array<{ id: Id<"keywords">; phrase: string }>;
        platform: "x" | "reddit" | "hacker_news";
        pointCount?: number;
        publishedAt: number;
        replyCount?: number;
        repostCount?: number;
        status: "new" | "saved" | "dismissed";
        title?: string;
      }
    >;
  };
  onboarding: {
    saveOnboardingConfiguration: FunctionReference<
      "mutation",
      "public",
      {
        categories: Array<{
          categoryId: Id<"categories">;
          colorToken:
            | "blue"
            | "orange"
            | "green"
            | "red"
            | "purple"
            | "yellow"
            | "gray"
            | "pink"
            | "cyan"
            | "slate";
          description: string;
          enabled: boolean;
        }>;
        keywords: Array<{
          phrase: string;
          platforms: Array<"x" | "reddit" | "hacker_news">;
        }>;
        workspaceName: string;
      },
      {
        keywordCount: number;
        keywordIds: Array<Id<"keywords">>;
        workspaceName: string;
      }
    >;
  };
  savedViews: {
    createSavedView: FunctionReference<
      "mutation",
      "public",
      {
        filters: {
          categoryIds?: Array<Id<"categories">>;
          keywordIds?: Array<Id<"keywords">>;
          mentionStatuses?: Array<"new" | "saved" | "dismissed">;
          platforms?: Array<"x" | "reddit" | "hacker_news">;
          publishedAfter?: number;
          publishedBefore?: number;
        };
        icon: string;
        name: string;
        sort: "newest" | "oldest" | "most_engaged";
      },
      {
        filters: {
          categoryIds?: Array<Id<"categories">>;
          keywordIds?: Array<Id<"keywords">>;
          mentionStatuses?: Array<"new" | "saved" | "dismissed">;
          platforms?: Array<"x" | "reddit" | "hacker_news">;
          publishedAfter?: number;
          publishedBefore?: number;
        };
        icon: string;
        id: string;
        name: string;
        position: number;
        sort: "newest" | "oldest" | "most_engaged";
      }
    >;
    deleteSavedView: FunctionReference<
      "mutation",
      "public",
      { savedViewId: string },
      null
    >;
    listSavedViews: FunctionReference<
      "query",
      "public",
      {},
      Array<{
        filters: {
          categoryIds?: Array<Id<"categories">>;
          keywordIds?: Array<Id<"keywords">>;
          mentionStatuses?: Array<"new" | "saved" | "dismissed">;
          platforms?: Array<"x" | "reddit" | "hacker_news">;
          publishedAfter?: number;
          publishedBefore?: number;
        };
        icon: string;
        id: string;
        name: string;
        position: number;
        sort: "newest" | "oldest" | "most_engaged";
      }>
    >;
    reorderSavedViews: FunctionReference<
      "mutation",
      "public",
      { savedViewIds: Array<string> },
      null
    >;
    updateSavedView: FunctionReference<
      "mutation",
      "public",
      {
        filters?: {
          categoryIds?: Array<Id<"categories">>;
          keywordIds?: Array<Id<"keywords">>;
          mentionStatuses?: Array<"new" | "saved" | "dismissed">;
          platforms?: Array<"x" | "reddit" | "hacker_news">;
          publishedAfter?: number;
          publishedBefore?: number;
        };
        icon?: string;
        name?: string;
        savedViewId: string;
        sort?: "newest" | "oldest" | "most_engaged";
      },
      {
        filters: {
          categoryIds?: Array<Id<"categories">>;
          keywordIds?: Array<Id<"keywords">>;
          mentionStatuses?: Array<"new" | "saved" | "dismissed">;
          platforms?: Array<"x" | "reddit" | "hacker_news">;
          publishedAfter?: number;
          publishedBefore?: number;
        };
        icon: string;
        id: string;
        name: string;
        position: number;
        sort: "newest" | "oldest" | "most_engaged";
      }
    >;
  };
  settings: {
    getSettings: FunctionReference<
      "query",
      "public",
      {},
      {
        digest: {
          enabled: boolean;
          hour: number;
          mentionLimit: number;
          minute: number;
          nextRunAt: number;
          timeZone: string;
        };
      }
    >;
    updateDigestPreferences: FunctionReference<
      "mutation",
      "public",
      {
        enabled: boolean;
        hour: number;
        mentionLimit: number;
        minute: number;
        timeZone: string;
      },
      {
        digest: {
          enabled: boolean;
          hour: number;
          mentionLimit: number;
          minute: number;
          nextRunAt: number;
          timeZone: string;
        };
      }
    >;
  };
  users: {
    bootstrapCurrentUser: FunctionReference<
      "mutation",
      "public",
      {},
      { userId: Id<"users">; workspaceId: Id<"workspaces"> }
    >;
    getCurrentUser: FunctionReference<
      "query",
      "public",
      {},
      {
        clerkUserId: string;
        email?: string;
        id: Id<"users">;
        imageUrl?: string;
        name?: string;
      }
    >;
    updateCurrentUser: FunctionReference<
      "mutation",
      "public",
      { imageUrl?: string; name?: string },
      {
        clerkUserId: string;
        email?: string;
        id: Id<"users">;
        imageUrl?: string;
        name?: string;
      }
    >;
  };
  workspaces: {
    deleteAccount: FunctionReference<
      "mutation",
      "public",
      { confirmation: string },
      | {
          code: "ACCOUNT_DELETION_ACCEPTED";
          deletionJobId: Id<"deletionJobs">;
          message: string;
          state: "accepted";
        }
      | {
          code: "ACCOUNT_DELETION_IN_PROGRESS";
          deletionJobId: Id<"deletionJobs">;
          message: string;
          state: "in_progress";
          status: string;
        }
      | {
          code: "BILLING_PORTAL_REQUIRED";
          deletionJobId?: Id<"deletionJobs">;
          message: string;
          state: "portal_required";
        }
      | {
          code: string;
          deletionJobId?: Id<"deletionJobs">;
          message: string;
          state: "support_required";
        }
    >;
    getAccountDeletionReadiness: FunctionReference<
      "query",
      "public",
      {},
      | { state: "available" }
      | {
          code: "ACCOUNT_DELETION_ACCEPTED";
          deletionJobId: Id<"deletionJobs">;
          message: string;
          state: "accepted";
        }
      | {
          code: "ACCOUNT_DELETION_IN_PROGRESS";
          deletionJobId: Id<"deletionJobs">;
          message: string;
          state: "in_progress";
          status: string;
        }
      | {
          code: "BILLING_PORTAL_REQUIRED";
          deletionJobId?: Id<"deletionJobs">;
          message: string;
          state: "portal_required";
        }
      | {
          code: string;
          deletionJobId?: Id<"deletionJobs">;
          message: string;
          state: "support_required";
        }
    >;
    getAccountDeletionStatus: FunctionReference<
      "query",
      "public",
      {},
      | { state: "available" }
      | {
          code: "ACCOUNT_DELETION_ACCEPTED";
          deletionJobId: Id<"deletionJobs">;
          message: string;
          state: "accepted";
        }
      | {
          code: "ACCOUNT_DELETION_IN_PROGRESS";
          deletionJobId: Id<"deletionJobs">;
          message: string;
          state: "in_progress";
          status: string;
        }
      | {
          code: "BILLING_PORTAL_REQUIRED";
          deletionJobId?: Id<"deletionJobs">;
          message: string;
          state: "portal_required";
        }
      | {
          code: string;
          deletionJobId?: Id<"deletionJobs">;
          message: string;
          state: "support_required";
        }
    >;
    getCurrentWorkspace: FunctionReference<
      "query",
      "public",
      {},
      {
        keywordCount: number;
        membership: { role: "owner" };
        onboardingComplete: boolean;
        user: {
          clerkUserId: string;
          email?: string;
          id: Id<"users">;
          imageUrl?: string;
          name?: string;
        };
        workspace: { id: Id<"workspaces">; kind: "personal"; name: string };
      }
    >;
    updateCurrentWorkspace: FunctionReference<
      "mutation",
      "public",
      { name: string },
      { id: Id<"workspaces">; kind: "personal"; name: string }
    >;
  };
};

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: {
  billing: {
    internal: {
      applyIncompleteCreemBillingEvent: FunctionReference<
        "mutation",
        "internal",
        {
          authoritativeSubscriptionJson: string;
          billingEventId: Id<"billingEvents">;
          receivedAt: number;
        },
        any
      >;
      applyUpgradeResponse: FunctionReference<
        "mutation",
        "internal",
        {
          incompleteReconciliation?: {
            actorClerkUserId: string;
            actorUserId: Id<"users">;
            attempt: number;
            delayMs: number;
            idempotencyKey: string;
          };
          providerCreatedAt: number;
          rawSubscriptionJson: string;
          workspaceId: Id<"workspaces">;
        },
        any
      >;
      beginCreemProviderOperation: FunctionReference<
        "mutation",
        "internal",
        {
          idempotencyKey: string;
          operation: string;
          workspaceId: Id<"workspaces">;
        },
        any
      >;
      dispatchPendingCreemBillingEvents: FunctionReference<
        "mutation",
        "internal",
        { now?: number },
        any
      >;
      getCustomerBillingActionContext: FunctionReference<
        "query",
        "internal",
        { idempotencyKey?: string; workspaceId: Id<"workspaces"> },
        any
      >;
      ingestCreemWebhook: FunctionReference<
        "mutation",
        "internal",
        { rawBody: string; receivedAt: number },
        any
      >;
      loadIncompleteCreemBillingEvent: FunctionReference<
        "query",
        "internal",
        { billingEventId: Id<"billingEvents"> },
        any
      >;
      markCreemProviderOperationUnresolved: FunctionReference<
        "mutation",
        "internal",
        {
          errorCode: string;
          errorMessage: string;
          idempotencyKey: string;
          workspaceId: Id<"workspaces">;
        },
        any
      >;
      recordCheckout: FunctionReference<
        "mutation",
        "internal",
        {
          createdAt: number;
          idempotencyKey: string;
          planId: "starter" | "growth" | "scale";
          providerCheckoutSessionId: string;
          providerStatus: string;
          requestedByUserId: Id<"users">;
          url: string;
          workspaceId: Id<"workspaces">;
        },
        any
      >;
      recordCreemProviderOperation: FunctionReference<
        "mutation",
        "internal",
        {
          actorClerkUserId?: string;
          actorUserId?: Id<"users">;
          durationMs: number;
          errorCode?: string;
          errorMessage?: string;
          idempotencyKey: string;
          operation: string;
          status: "failed" | "succeeded";
          targetId?: string;
          workspaceId?: Id<"workspaces">;
        },
        any
      >;
    };
    reconciliation: {
      reconcileIncompleteCreemBillingEvent: FunctionReference<
        "action",
        "internal",
        { billingEventId: Id<"billingEvents"> },
        any
      >;
      reconcileIncompleteCreemUpgrade: FunctionReference<
        "action",
        "internal",
        {
          actorClerkUserId: string;
          actorUserId: Id<"users">;
          attempt: number;
          idempotencyKey: string;
          providerSubscriptionId: string;
          workspaceId: Id<"workspaces">;
        },
        any
      >;
    };
  };
  categories: {
    reassignCategoryDeletionBatch: FunctionReference<
      "mutation",
      "internal",
      {
        categoryId: Id<"categories">;
        otherCategoryId: Id<"categories">;
        workspaceId: Id<"workspaces">;
      },
      { reassignedCount: number; state: "completed" | "in_progress" | "stale" }
    >;
  };
  categorization: {
    actions: {
      executeCategorizationBatch: FunctionReference<
        "action",
        "internal",
        {
          categorySnapshotJson: string;
          jobIds: Array<Id<"categorizationJobs">>;
          leaseToken: string;
        },
        any
      >;
    };
    internal: {
      applyCategorizationBatch: FunctionReference<
        "mutation",
        "internal",
        {
          categorySnapshotJson: string;
          durationMs: number;
          jobIds: Array<Id<"categorizationJobs">>;
          leaseToken: string;
          resultsJson: string;
        },
        any
      >;
      dispatchDueCategorizationJobs: FunctionReference<
        "mutation",
        "internal",
        { now?: number },
        any
      >;
      failCategorizationBatch: FunctionReference<
        "mutation",
        "internal",
        {
          categorySnapshotJson: string;
          durationMs: number;
          errorCode: string;
          errorMessage: string;
          jobIds: Array<Id<"categorizationJobs">>;
          leaseToken: string;
          retryAfterMs?: number;
          retryable: boolean;
        },
        any
      >;
      loadCategorizationBatchContext: FunctionReference<
        "query",
        "internal",
        {
          categorySnapshotJson: string;
          jobIds: Array<Id<"categorizationJobs">>;
          leaseToken: string;
        },
        any
      >;
      releaseCategorizationBlockedConfiguration: FunctionReference<
        "mutation",
        "internal",
        {
          categorySnapshotJson: string;
          jobIds: Array<Id<"categorizationJobs">>;
          leaseToken: string;
        },
        any
      >;
      startCategorizationProviderRun: FunctionReference<
        "mutation",
        "internal",
        {
          categorySnapshotJson: string;
          jobIds: Array<Id<"categorizationJobs">>;
          leaseToken: string;
        },
        any
      >;
    };
  };
  deletion: {
    actions: {
      runAccountDeletion: FunctionReference<
        "action",
        "internal",
        {
          deletionJobId: Id<"deletionJobs">;
          leaseToken: string;
          leaseVersion: number;
        },
        any
      >;
    };
    internal: {
      beginAccountDeletionPurge: FunctionReference<
        "mutation",
        "internal",
        {
          deletionJobId: Id<"deletionJobs">;
          leaseToken: string;
          leaseVersion: number;
          now?: number;
          providerVerifiedAt: number;
        },
        any
      >;
      blockAccountDeletionForBilling: FunctionReference<
        "mutation",
        "internal",
        {
          code: string;
          deletionJobId: Id<"deletionJobs">;
          leaseToken: string;
          leaseVersion: number;
          now?: number;
        },
        any
      >;
      completeIdentityDeletion: FunctionReference<
        "mutation",
        "internal",
        {
          deletionJobId: Id<"deletionJobs">;
          fenceExpiresAt: number;
          leaseToken: string;
          leaseVersion: number;
          now?: number;
        },
        any
      >;
      continueAccountDeletion: FunctionReference<
        "mutation",
        "internal",
        {
          deletionJobId: Id<"deletionJobs">;
          leaseToken: string;
          leaseVersion: number;
          now?: number;
        },
        any
      >;
      dispatchDueAccountDeletions: FunctionReference<
        "mutation",
        "internal",
        { now?: number },
        any
      >;
      failAccountDeletionAttempt: FunctionReference<
        "mutation",
        "internal",
        {
          code: string;
          deletionJobId: Id<"deletionJobs">;
          leaseToken: string;
          leaseVersion: number;
          now?: number;
          retryable: boolean;
        },
        any
      >;
      finalizeSecurityTombstone: FunctionReference<
        "mutation",
        "internal",
        {
          deletionJobId: Id<"deletionJobs">;
          leaseToken: string;
          leaseVersion: number;
          now?: number;
        },
        any
      >;
      loadIdentityDeletionContext: FunctionReference<
        "query",
        "internal",
        {
          deletionJobId: Id<"deletionJobs">;
          leaseToken: string;
          leaseVersion: number;
        },
        any
      >;
      purgeAccountDeletionBatch: FunctionReference<
        "mutation",
        "internal",
        {
          deletionJobId: Id<"deletionJobs">;
          leaseToken: string;
          leaseVersion: number;
          now?: number;
        },
        any
      >;
      startAccountDeletionAttempt: FunctionReference<
        "mutation",
        "internal",
        {
          deletionJobId: Id<"deletionJobs">;
          leaseToken: string;
          leaseVersion: number;
          now?: number;
        },
        any
      >;
      verifyAccountDeletionData: FunctionReference<
        "mutation",
        "internal",
        {
          deletionJobId: Id<"deletionJobs">;
          leaseToken: string;
          leaseVersion: number;
          now?: number;
        },
        any
      >;
    };
  };
  digest: {
    actions: {
      renderDailyDigest: FunctionReference<
        "action",
        "internal",
        { digestRunId: Id<"digestRuns"> },
        any
      >;
    };
    internal: {
      aggregateDailyDigestPage: FunctionReference<
        "mutation",
        "internal",
        { digestRunId: Id<"digestRuns"> },
        any
      >;
      dispatchDueDailyDigests: FunctionReference<
        "mutation",
        "internal",
        { now?: number },
        any
      >;
      enqueueRenderedDailyDigest: FunctionReference<
        "mutation",
        "internal",
        {
          digestRunId: Id<"digestRuns">;
          from: string;
          html: string;
          replyTo?: string;
          subject: string;
          text: string;
          to: string;
        },
        any
      >;
      loadDailyDigestRenderContext: FunctionReference<
        "query",
        "internal",
        { digestRunId: Id<"digestRuns"> },
        any
      >;
      markDailyDigestFailed: FunctionReference<
        "mutation",
        "internal",
        { digestRunId: Id<"digestRuns">; error: string },
        any
      >;
    };
  };
  email: {
    actions: {
      deliverEmail: FunctionReference<
        "action",
        "internal",
        { leaseToken: string; outboxId: Id<"emailOutbox"> },
        any
      >;
    };
    internal: {
      completeEmailDelivery: FunctionReference<
        "mutation",
        "internal",
        {
          durationMs: number;
          leaseToken: string;
          outboxId: Id<"emailOutbox">;
          providerMessageId: string;
        },
        any
      >;
      dispatchPendingEmails: FunctionReference<
        "mutation",
        "internal",
        { now?: number },
        any
      >;
      failEmailDelivery: FunctionReference<
        "mutation",
        "internal",
        {
          durationMs: number;
          errorCode: string;
          errorMessage: string;
          leaseToken: string;
          outboxId: Id<"emailOutbox">;
          retryable: boolean;
        },
        any
      >;
      loadLeasedEmail: FunctionReference<
        "mutation",
        "internal",
        { leaseToken: string; outboxId: Id<"emailOutbox"> },
        any
      >;
      releaseEmailBlockedConfig: FunctionReference<
        "mutation",
        "internal",
        { leaseToken: string; outboxId: Id<"emailOutbox"> },
        any
      >;
    };
    webhookInternal: {
      ingestResendWebhookEvent: FunctionReference<
        "mutation",
        "internal",
        {
          createdAt: number;
          eventId: string;
          providerMessageId: string;
          receivedAt: number;
          type:
            | "email.scheduled"
            | "email.sent"
            | "email.delivery_delayed"
            | "email.delivered"
            | "email.opened"
            | "email.clicked"
            | "email.complained"
            | "email.bounced"
            | "email.failed"
            | "email.suppressed";
        },
        any
      >;
      reconcileResendWebhookEvent: FunctionReference<
        "mutation",
        "internal",
        { eventRowId: Id<"emailWebhookEvents"> },
        any
      >;
    };
  };
  ingestion: {
    internal: {
      applyIngestionChunk: FunctionReference<
        "mutation",
        "internal",
        { inputJson: string },
        any
      >;
    };
  };
  lib: {
    authorization: {
      resolveCurrentCustomerAuthorizationForAction: FunctionReference<
        "query",
        "internal",
        { clerkUserId: string; tokenIdentifier: string },
        any
      >;
      resolveCustomerAuthorization: FunctionReference<
        "query",
        "internal",
        {
          clerkUserId: string;
          tokenIdentifier: string;
          workspaceId: Id<"workspaces">;
        },
        any
      >;
    };
  };
  scheduling: {
    actions: {
      executeTrackingSource: FunctionReference<
        "action",
        "internal",
        {
          leaseExpiresAt: number;
          leaseToken: string;
          leaseVersion: number;
          trackingSourceId: Id<"trackingSources">;
        },
        any
      >;
    };
    internal: {
      applyNextTrackingProviderPage: FunctionReference<
        "mutation",
        "internal",
        {
          leaseExpiresAt: number;
          leaseToken: string;
          leaseVersion: number;
          trackingSourceId: Id<"trackingSources">;
        },
        any
      >;
      commitTrackingProviderPages: FunctionReference<
        "mutation",
        "internal",
        {
          batchCount: number;
          leaseExpiresAt: number;
          leaseToken: string;
          leaseVersion: number;
          trackingSourceId: Id<"trackingSources">;
        },
        any
      >;
      dispatchDueTrackingSources: FunctionReference<
        "mutation",
        "internal",
        { now?: number },
        any
      >;
      failTrackingProviderRun: FunctionReference<
        "mutation",
        "internal",
        {
          durationMs: number;
          errorCode: string;
          errorMessage: string;
          leaseExpiresAt: number;
          leaseToken: string;
          leaseVersion: number;
          retryAfterMs?: number;
          retryable: boolean;
          trackingSourceId: Id<"trackingSources">;
        },
        any
      >;
      loadTrackingExecutionContext: FunctionReference<
        "query",
        "internal",
        {
          leaseExpiresAt: number;
          leaseToken: string;
          leaseVersion: number;
          trackingSourceId: Id<"trackingSources">;
        },
        any
      >;
      releaseIneligibleTrackingLease: FunctionReference<
        "mutation",
        "internal",
        {
          deletionPausedAt?: number;
          leaseExpiresAt: number;
          leaseToken: string;
          leaseVersion: number;
          reason:
            | "keyword_inactive"
            | "paid_inactive"
            | "provider_unconfigured"
            | "usage_exhausted"
            | "workspace_deleting";
          trackingSourceId: Id<"trackingSources">;
        },
        any
      >;
      stageTrackingProviderPage: FunctionReference<
        "mutation",
        "internal",
        {
          batchIndex: number;
          durationMs: number;
          finalize: boolean;
          leaseExpiresAt: number;
          leaseToken: string;
          leaseVersion: number;
          providerOutputCount: number;
          resultJson: string;
          trackingSourceId: Id<"trackingSources">;
        },
        any
      >;
      startTrackingProviderRun: FunctionReference<
        "mutation",
        "internal",
        {
          leaseExpiresAt: number;
          leaseToken: string;
          leaseVersion: number;
          trackingSourceId: Id<"trackingSources">;
        },
        any
      >;
    };
  };
};

export declare const components: {};
