"use client"

import { useAuth } from "@clerk/nextjs"
import { useConvexAuth } from "convex/react"
import { usePathname, useRouter } from "next/navigation"
import { Component, useEffect, useState, type ReactNode } from "react"

import { ProductContextProvider } from "@/components/product/product-context"
import { ProductShell } from "@/components/product/product-shell"
import {
  ProductErrorState,
  ProductLoadingState,
} from "@/components/product/product-states"
import { useProductBootstrap } from "@/components/product/use-product-bootstrap"
import { productRedirectForPath } from "@/lib/product-access"

class ProductDataErrorBoundary extends Component<
  { children: ReactNode; onRetry: () => void },
  { failed: boolean }
> {
  override state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  override render() {
    if (this.state.failed) {
      return (
        <ProductErrorState
          title="Your account couldn't load"
          description="The account may be temporarily unavailable or you may not have access. Try again."
          onRetry={this.props.onRetry}
        />
      )
    }

    return this.props.children
  }
}

function AuthenticatedProductSession({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth()
  const product = useProductBootstrap(isAuthenticated)
  const pathname = usePathname()
  const router = useRouter()
  const redirectTarget =
    product.state === "ready"
      ? productRedirectForPath(pathname, product.access)
      : null

  useEffect(() => {
    if (redirectTarget) {
      router.replace(redirectTarget)
    }
  }, [redirectTarget, router])

  if (isLoading) {
    return <ProductLoadingState message="Loading your workspace…" />
  }

  if (!isAuthenticated) {
    return (
      <ProductErrorState
        title="Your account session isn't ready"
        description="Astreex couldn't verify this session. Refresh the page or sign in again."
        onRetry={() => window.location.reload()}
      />
    )
  }

  if (product.state === "loading") {
    return <ProductLoadingState message={product.message} />
  }

  if (product.state === "error") {
    return (
      <ProductErrorState
        title={product.title}
        description={product.description}
        onRetry={product.retry}
      />
    )
  }

  if (redirectTarget) {
    return <ProductLoadingState message="Opening the correct account view…" />
  }

  return (
    <ProductContextProvider
      value={{
        access: product.access,
        billing: product.billing,
        workspace: product.workspace,
      }}
    >
      <ProductShell variant={pathname === "/onboarding" ? "fullscreen" : "sidebar"}>
        {children}
      </ProductShell>
    </ProductContextProvider>
  )
}

function ProductRuntimeSession({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, userId } = useAuth()

  if (!isLoaded) {
    return <ProductLoadingState message="Checking the signed-in account…" />
  }

  if (!isSignedIn || !userId) {
    return (
      <ProductErrorState
        title="Your session has ended"
        description="Sign in again before opening protected account data."
        onRetry={() => window.location.assign("/sign-in?redirect_url=/app")}
      />
    )
  }

  return (
    <AuthenticatedProductSession key={userId}>
      {children}
    </AuthenticatedProductSession>
  )
}

export function ProductRuntime({ children }: { children: ReactNode }) {
  const [boundaryKey, setBoundaryKey] = useState(0)

  return (
    <ProductDataErrorBoundary
      key={boundaryKey}
      onRetry={() => setBoundaryKey((current) => current + 1)}
    >
      <ProductRuntimeSession>{children}</ProductRuntimeSession>
    </ProductDataErrorBoundary>
  )
}
