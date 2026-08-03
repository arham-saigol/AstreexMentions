import "server-only"

import { api } from "@astreex/backend/api"
import { ConvexHttpClient } from "convex/browser"
import type { FunctionReturnType } from "convex/server"
import { cache } from "react"

import { getRuntimeConfiguration } from "@/lib/env"

export type PublishedChangelogSummary = FunctionReturnType<
  typeof api.changelog.listPublishedEntries
>["entries"][number]
export type PublishedChangelogEntry = NonNullable<
  FunctionReturnType<typeof api.changelog.getPublishedEntry>
>

export type ChangelogListResult =
  | {
      state: "ready"
      entries: PublishedChangelogSummary[]
      isDone: boolean
      nextCursor: string | null
    }
  | {
      state: "configuration-required"
    }
  | {
      state: "error"
    }

export type ChangelogEntryResult =
  | {
      state: "ready"
      entry: PublishedChangelogEntry | null
    }
  | {
      state: "configuration-required"
    }
  | {
      state: "error"
    }

export const getPublishedChangelogEntries = cache(
  async (cursor?: string): Promise<ChangelogListResult> => {
    const configuration = getRuntimeConfiguration()

    if (!configuration.convex.configured || !configuration.convex.url) {
      return { state: "configuration-required" }
    }

    try {
      const client = new ConvexHttpClient(configuration.convex.url, {
        logger: false,
      })
      const response = await client.query(api.changelog.listPublishedEntries, {
        ...(cursor === undefined ? {} : { cursor }),
      })
      return {
        state: "ready",
        ...response,
      }
    } catch {
      return { state: "error" }
    }
  },
)

export const getPublishedChangelogEntry = cache(
  async (slug: string): Promise<ChangelogEntryResult> => {
    const configuration = getRuntimeConfiguration()

    if (!configuration.convex.configured || !configuration.convex.url) {
      return { state: "configuration-required" }
    }

    try {
      const client = new ConvexHttpClient(configuration.convex.url, {
        logger: false,
      })
      const entry = await client.query(api.changelog.getPublishedEntry, {
        slug,
      })
      return { state: "ready", entry }
    } catch {
      return { state: "error" }
    }
  },
)

export function formatChangelogDate(timestamp: number): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(timestamp))
}

export function changelogDateTime(timestamp: number): string {
  return new Date(timestamp).toISOString()
}
