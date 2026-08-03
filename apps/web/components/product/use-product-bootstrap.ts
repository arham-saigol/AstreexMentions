"use client"

import { useMutation, useQuery } from "convex/react"
import { useCallback, useEffect, useMemo, useState } from "react"

import {
  billingOverviewResultSchema,
  bootstrapResultSchema,
  currentWorkspaceResultSchema,
  customerConvex,
  type BillingOverviewResult,
  type CurrentWorkspaceResult,
} from "@/lib/customer-convex"
import { decideProductAccess, type ProductAccess } from "@/lib/product-access"
import { useQueryClock } from "@/lib/use-query-clock"

type ProductBootstrapState =
  | {
      state: "loading"
      message: string
    }
  | {
      state: "error"
      description: string
      retry: () => void
      title: string
    }
  | {
      access: ProductAccess
      billing: BillingOverviewResult
      state: "ready"
      workspace: CurrentWorkspaceResult
    }

type BootstrapAttempt =
  | { attempt: number; state: "loading" }
  | { attempt: number; description: string; state: "error" }
  | { attempt: number; state: "ready" }

export function useProductBootstrap(
  convexAuthenticated: boolean,
): ProductBootstrapState {
  const bootstrapCurrentUser = useMutation(
    customerConvex.users.bootstrapCurrentUser,
  )
  const [bootstrap, setBootstrap] = useState<BootstrapAttempt>({
    attempt: 0,
    state: "loading",
  })
  const queryNow = useQueryClock()

  useEffect(() => {
    if (!convexAuthenticated || bootstrap.state !== "loading") {
      return
    }

    let active = true

    void bootstrapCurrentUser({})
      .then((value) => {
        if (!active) {
          return
        }

        const parsed = bootstrapResultSchema.safeParse(value)
        if (!parsed.success) {
          setBootstrap((current) => ({
            attempt: current.attempt,
            description:
              "The account bootstrap returned an unexpected result. No account data was inferred.",
            state: "error",
          }))
          return
        }

        setBootstrap((current) => ({
          attempt: current.attempt,
          state: "ready",
        }))
      })
      .catch(() => {
        if (!active) {
          return
        }

        setBootstrap((current) => ({
          attempt: current.attempt,
          description:
            "Astreex could not initialize this account. Check the authenticated Convex connection and try again.",
          state: "error",
        }))
      })

    return () => {
      active = false
    }
  }, [bootstrap.state, bootstrapCurrentUser, convexAuthenticated])

  const queryEnabled = convexAuthenticated && bootstrap.state === "ready"
  const currentWorkspaceValue = useQuery(
    customerConvex.workspaces.getCurrentWorkspace,
    queryEnabled ? {} : "skip",
  )
  const billingOverviewValue = useQuery(
    customerConvex.billing.getOverview,
    queryEnabled ? { now: queryNow } : "skip",
  )

  const retry = useCallback(() => {
    setBootstrap((current) => ({
      attempt: current.attempt + 1,
      state: "loading",
    }))
  }, [])

  return useMemo((): ProductBootstrapState => {
    if (!convexAuthenticated) {
      return {
        message: "Connecting the authenticated account session…",
        state: "loading",
      }
    }

    if (bootstrap.state === "loading") {
      return {
        message: "Preparing your Astreex account…",
        state: "loading",
      }
    }

    if (bootstrap.state === "error") {
      return {
        description: bootstrap.description,
        retry,
        state: "error",
        title: "Account initialization failed",
      }
    }

    if (
      currentWorkspaceValue === undefined ||
      billingOverviewValue === undefined
    ) {
      return {
        message: "Loading account and subscription status…",
        state: "loading",
      }
    }

    const currentWorkspace = currentWorkspaceResultSchema.safeParse(
      currentWorkspaceValue,
    )
    const billingOverview =
      billingOverviewResultSchema.safeParse(billingOverviewValue)

    if (!currentWorkspace.success || !billingOverview.success) {
      return {
        description:
          "The connected data service returned a result this version of the app cannot safely display.",
        retry: () => window.location.reload(),
        state: "error",
        title: "Account data is unavailable",
      }
    }

    return {
      access: decideProductAccess(currentWorkspace.data, billingOverview.data),
      billing: billingOverview.data,
      state: "ready",
      workspace: currentWorkspace.data,
    }
  }, [
    billingOverviewValue,
    bootstrap,
    convexAuthenticated,
    currentWorkspaceValue,
    retry,
  ])
}
