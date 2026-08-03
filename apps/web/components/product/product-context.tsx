"use client"

import { createContext, useContext, type ReactNode } from "react"

import type {
  BillingOverviewResult,
  CurrentWorkspaceResult,
  ProductAccess,
} from "@/lib/product-access"

export type ProductContextValue = {
  access: ProductAccess
  billing: BillingOverviewResult
  workspace: CurrentWorkspaceResult
}

const ProductContext = createContext<ProductContextValue | null>(null)

export function ProductContextProvider({
  children,
  value,
}: {
  children: ReactNode
  value: ProductContextValue
}) {
  return (
    <ProductContext.Provider value={value}>{children}</ProductContext.Provider>
  )
}

export function useProductContext(): ProductContextValue {
  const context = useContext(ProductContext)

  if (!context) {
    throw new Error("useProductContext must be used inside the product layout")
  }

  return context
}
