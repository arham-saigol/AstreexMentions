"use client"

import { api } from "@astreex/backend/api"
import { useMutation, useQuery } from "convex/react"
import { useCallback, useEffect, useMemo, useState } from "react"

import {
  type BillingOverviewResult,
  type CurrentWorkspaceResult,
  decideProductAccess,
  type ProductAccess,
} from "@/lib/product-access"

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
  const bootstrapCurrentUser = useMutation(api.users.bootstrapCurrentUser)
  const [bootstrap, setBootstrap] = useState<BootstrapAttempt>({
    attempt: 0,
    state: "loading",
  })

  useEffect(() => {
    if (!convexAuthenticated || bootstrap.state !== "loading") {
      return
    }

    let active = true

    void bootstrapCurrentUser({})
      .then(() => {
        if (!active) {
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
    api.workspaces.getCurrentWorkspace,
    queryEnabled ? {} : "skip",
  )
  const billingOverviewValue = useQuery(
    api.billing.customer.getBillingOverview,
    queryEnabled ? {} : "skip",
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

    return {
      access: decideProductAccess(currentWorkspaceValue, billingOverviewValue),
      billing: billingOverviewValue,
      state: "ready",
      workspace: currentWorkspaceValue,
    }
  }, [
    billingOverviewValue,
    bootstrap,
    convexAuthenticated,
    currentWorkspaceValue,
    retry,
  ])
}
