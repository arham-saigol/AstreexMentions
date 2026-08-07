"use client"

import { Button } from "@astreex/ui/components/button"
import { StatusState } from "@astreex/ui/components/status-state"
import { LogIn, RefreshCw } from "lucide-react"
import Link from "next/link"

import type { ConfigurationIssue } from "@/lib/env"

type AccessStateProps =
  | Readonly<{
      kind: "configuration"
      issues: ConfigurationIssue[]
    }>
  | Readonly<{
      kind: "signed-out"
    }>
  | Readonly<{
      kind: "unauthorized"
    }>
  | Readonly<{
      kind: "data-configuration"
      issues: ConfigurationIssue[]
    }>
  | Readonly<{
      kind: "unavailable"
    }>

const copy = {
  configuration: {
    title: "Admin access is not configured",
    description:
      "Access remains denied until every required server-side authentication value is present.",
    variant: "warning" as const,
  },
  "data-configuration": {
    title: "Admin data is not connected",
    description:
      "Authentication succeeded, but the dashboard cannot make authenticated Convex requests yet.",
    variant: "warning" as const,
  },
  "signed-out": {
    title: "Sign in to continue",
    description:
      "Use the Clerk account whose user ID exactly matches ADMIN_CLERK_USER_ID.",
    variant: "info" as const,
  },
  unauthorized: {
    title: "This account is not authorized",
    description:
      "The signed-in Clerk user ID does not exactly match the configured administrator.",
    variant: "error" as const,
  },
  unavailable: {
    title: "Admin data is unavailable",
    description:
      "The dashboard could not load a verified response from Convex. No placeholder data is shown.",
    variant: "error" as const,
  },
}

export function AccessState(props: AccessStateProps) {
  const content = copy[props.kind]
  const issues = "issues" in props ? props.issues : []

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-2xl items-center px-4 py-12 sm:px-6">
      <StatusState
        className="bg-card w-full"
        variant={content.variant}
        title={content.title}
        description={
          <div className="space-y-4">
            <p>{content.description}</p>
            {issues.length > 0 ? (
              <ul className="space-y-2" aria-label="Configuration requirements">
                {issues.map((issue) => (
                  <li
                    key={`${issue.name}-${issue.reason}`}
                    className="bg-background rounded-md border px-3 py-2"
                  >
                    <code className="font-mono text-xs font-semibold">
                      {issue.name}
                    </code>
                    <p className="text-muted-foreground mt-1 text-sm">
                      {issue.reason}
                    </p>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        }
        action={
          props.kind === "signed-out" ? (
            <Button asChild>
              <Link href="/sign-in">
                <LogIn aria-hidden="true" />
                Sign in
              </Link>
            </Button>
          ) : props.kind === "unavailable" ? (
            <Button asChild variant="outline">
              <Link href="/metrics">
                <RefreshCw aria-hidden="true" />
                Try again
              </Link>
            </Button>
          ) : undefined
        }
      />
    </div>
  )
}
