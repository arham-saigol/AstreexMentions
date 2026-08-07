import { WarningCircleIcon } from "@phosphor-icons/react/dist/ssr"
import { Button } from "@astreex/ui/components/button"
import Link from "next/link"

import type { ServiceConfiguration } from "@/lib/env"

type ConfigurationRequiredProps = {
  services: ServiceConfiguration[]
  title?: string
  description?: string
}

export function ConfigurationRequired({
  services,
  title = "Configuration required",
  description = "This part of Astreex is unavailable until the required services are configured.",
}: ConfigurationRequiredProps) {
  return (
    <section
      aria-labelledby="configuration-title"
      className="mx-auto w-full max-w-2xl px-6 py-20 sm:py-28"
    >
      <div className="border-border bg-card rounded-xl border p-6 sm:p-8">
        <div className="border-border bg-muted text-muted-foreground mb-5 grid size-11 place-items-center rounded-lg border">
          <WarningCircleIcon aria-hidden="true" className="size-6" />
        </div>
        <p className="text-primary text-sm font-semibold">Service status</p>
        <h1
          id="configuration-title"
          className="font-display text-foreground mt-2 text-3xl font-medium tracking-[-0.025em] sm:text-4xl"
        >
          {title}
        </h1>
        <p className="text-muted-foreground mt-3 max-w-xl text-sm leading-6 sm:text-base">
          {description}
        </p>

        <div className="border-border mt-7 divide-y rounded-lg border">
          {services.map((service) => (
            <div key={service.id} className="p-4 sm:p-5">
              <h2 className="text-foreground text-sm font-semibold">
                {service.label}
              </h2>
              <p className="text-muted-foreground mt-1 text-sm leading-6">
                {service.description}
              </p>
              {service.issues.length > 0 && (
                <ul
                  className="mt-3 space-y-2"
                  aria-label="Configuration issues"
                >
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
              )}
            </div>
          ))}
        </div>

        <div className="mt-7">
          <Button asChild variant="outline">
            <Link href="/">Return to the public site</Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
