"use client"

import {
  ArrowClockwiseIcon,
  CircleNotchIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react"
import { AstreexWordmark } from "@astreex/ui/components/astreex-wordmark"
import { Button } from "@astreex/ui/components/button"

export function ProductLoadingState({ message }: { message: string }) {
  return (
    <main className="grid min-h-dvh place-items-center px-6 py-16">
      <div
        className="w-full max-w-sm text-center"
        role="status"
        aria-live="polite"
      >
        <AstreexWordmark className="justify-center" />
        <CircleNotchIcon
          aria-hidden="true"
          className="text-primary mx-auto mt-8 size-6 animate-spin"
          weight="bold"
        />
        <p className="text-muted-foreground mt-4 text-sm">{message}</p>
      </div>
    </main>
  )
}

export function ProductErrorState({
  description,
  onRetry,
  title,
}: {
  description: string
  onRetry: () => void
  title: string
}) {
  return (
    <main className="grid min-h-dvh place-items-center px-6 py-16">
      <section
        aria-labelledby="product-error-title"
        className="w-full max-w-xl"
      >
        <AstreexWordmark />
        <div className="border-border mt-8 border-y py-8" role="alert">
          <WarningCircleIcon
            aria-hidden="true"
            className="text-destructive size-7"
          />
          <h1
            id="product-error-title"
            className="text-foreground mt-4 text-2xl font-semibold tracking-tight"
          >
            {title}
          </h1>
          <p className="text-muted-foreground mt-3 max-w-lg text-sm leading-6">
            {description}
          </p>
          <Button onClick={onRetry} variant="outline" className="mt-6">
            <ArrowClockwiseIcon aria-hidden="true" />
            Try again
          </Button>
        </div>
        <p className="text-muted-foreground mt-5 text-xs leading-5">
          Astreex does not substitute sample account, subscription, or customer
          data when a protected request fails.
        </p>
      </section>
    </main>
  )
}
