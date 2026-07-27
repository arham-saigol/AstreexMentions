import { WarningCircleIcon } from "@phosphor-icons/react/dist/ssr"
import { Button } from "@astreex/ui/components/button"
import Link from "next/link"

import type { ServiceConfiguration } from "@/lib/env"

type AuthConfigurationRequiredProps = {
  service: ServiceConfiguration
  title: string
  description: string
}

export function AuthConfigurationRequired({
  service,
  title,
  description,
}: AuthConfigurationRequiredProps) {
  return (
    <div aria-labelledby="auth-configuration-title">
      <div className="border-border bg-muted text-muted-foreground grid size-10 place-items-center rounded-lg border">
        <WarningCircleIcon aria-hidden="true" className="size-5" />
      </div>
      <p className="text-primary mt-5 text-xs font-semibold tracking-wide uppercase">
        Service status
      </p>
      <h2
        id="auth-configuration-title"
        className="text-foreground mt-2 text-2xl font-semibold tracking-tight sm:text-3xl"
      >
        {title}
      </h2>
      <p className="text-muted-foreground mt-3 max-w-lg text-sm leading-6 sm:text-base">
        {description}
      </p>

      <div className="border-border mt-7 border-y">
        <div className="py-5">
          <p className="text-foreground text-sm font-semibold">
            {service.label}
          </p>
          <p className="text-muted-foreground mt-1 text-sm leading-6">
            {service.description}
          </p>
          <ul className="mt-4 space-y-2" aria-label="Configuration issues">
            {service.issues.map((issue) => (
              <li
                key={issue.variable}
                className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs"
              >
                <code className="border-border bg-muted text-foreground rounded border px-1.5 py-0.5 font-mono">
                  {issue.variable}
                </code>
                <span>
                  {issue.reason === "missing"
                    ? "is not set"
                    : "has an invalid value"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="text-muted-foreground mt-5 text-xs leading-5">
        No identity, account, monitoring profile, or subscription has been
        created or inferred.
      </p>
      <Button asChild variant="outline" className="mt-6">
        <Link href="/">Return to the public site</Link>
      </Button>
    </div>
  )
}
