import { Skeleton } from "@astreex/ui/components/skeleton"

import { AuthFrame } from "@/components/auth-frame"

type AuthRouteLoadingProps = {
  mode: "sign-in" | "sign-up"
}

export function AuthRouteLoading({ mode }: AuthRouteLoadingProps) {
  const isSignIn = mode === "sign-in"

  return (
    <AuthFrame
      eyebrow={isSignIn ? "Account access" : "Create your account"}
      title={
        isSignIn
          ? "Return to the conversations you are reviewing."
          : "Build a customer-signal practice around deliberate scope."
      }
      description="Preparing the configured authentication experience."
    >
      <div
        className="border-border bg-card w-full rounded-xl border p-6 shadow-xs sm:p-8"
        aria-busy="true"
        aria-live="polite"
      >
        <span className="sr-only">Loading authentication</span>
        <Skeleton className="mx-auto h-7 w-44" />
        <Skeleton className="mx-auto mt-3 h-4 w-64 max-w-full" />
        <div className="mt-7 space-y-3">
          <Skeleton className="h-10 w-full" />
          <div className="flex items-center gap-3 py-1">
            <Skeleton className="h-px flex-1 rounded-none" />
            <Skeleton className="h-3 w-8" />
            <Skeleton className="h-px flex-1 rounded-none" />
          </div>
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
        <Skeleton className="mx-auto mt-7 h-4 w-52" />
      </div>
    </AuthFrame>
  )
}
