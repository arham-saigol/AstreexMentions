"use client"

import {
  createContext,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

import { FeatureRequestDialogShell } from "@/components/product/feature-request-dialog-shell"
import { productSettingsSections } from "@/components/product/settings/product-settings-sections"
import {
  SettingsDialogShell,
  type SettingsSectionId,
} from "@/components/product/settings-dialog-shell"

type ProductDialogsContextValue = {
  openFeatureRequests: (returnFocus?: HTMLElement | null) => void
  openSettings: (
    sectionId?: SettingsSectionId,
    returnFocus?: HTMLElement | null,
  ) => void
}

const ProductDialogsContext = createContext<ProductDialogsContextValue | null>(
  null,
)

export function ProductDialogsProvider({ children }: { children: ReactNode }) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsDialogKey, setSettingsDialogKey] = useState(0)
  const [settingsSectionId, setSettingsSectionId] =
    useState<SettingsSectionId>("general")
  const [featureRequestsOpen, setFeatureRequestsOpen] = useState(false)
  const settingsReturnFocusRef = useRef<HTMLElement | null>(null)
  const featureRequestReturnFocusRef = useRef<HTMLElement | null>(null)
  const value = useMemo(
    () => ({
      openFeatureRequests: (returnFocus?: HTMLElement | null) => {
        const activeElement =
          typeof document === "undefined" ? null : document.activeElement
        featureRequestReturnFocusRef.current =
          returnFocus ??
          (activeElement instanceof HTMLElement ? activeElement : null)
        setFeatureRequestsOpen(true)
      },
      openSettings: (
        sectionId: SettingsSectionId = "general",
        returnFocus?: HTMLElement | null,
      ) => {
        const activeElement =
          typeof document === "undefined" ? null : document.activeElement
        settingsReturnFocusRef.current =
          returnFocus ??
          (activeElement instanceof HTMLElement ? activeElement : null)
        setSettingsSectionId(sectionId)
        setSettingsDialogKey((current) => current + 1)
        setSettingsOpen(true)
      },
    }),
    [],
  )

  return (
    <ProductDialogsContext.Provider value={value}>
      {children}
      <SettingsDialogShell
        key={settingsDialogKey}
        initialSectionId={settingsSectionId}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        returnFocusRef={settingsReturnFocusRef}
        sections={productSettingsSections}
      />
      <FeatureRequestDialogShell
        open={featureRequestsOpen}
        onOpenChange={setFeatureRequestsOpen}
        returnFocusRef={featureRequestReturnFocusRef}
      />
    </ProductDialogsContext.Provider>
  )
}

export function useProductDialogs(): ProductDialogsContextValue {
  const context = useContext(ProductDialogsContext)

  if (!context) {
    throw new Error("Product dialog triggers require ProductDialogsProvider")
  }

  return context
}
