"use client"

import { Button } from "@astreex/ui/components/button"
import {
  createContext,
  useContext,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react"

import { FeatureRequestDialogShell } from "@/components/product/feature-request-dialog-shell"
import { productSettingsSections } from "@/components/product/settings/product-settings-sections"
import {
  SettingsDialogShell,
  type SettingsDialogSection,
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

export function ProductDialogsProvider({
  children,
  featureRequestBody,
  settingsSections = productSettingsSections,
}: {
  children: ReactNode
  featureRequestBody?: ReactNode
  settingsSections?: SettingsDialogSection[]
}) {
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
        sections={settingsSections}
      />
      <FeatureRequestDialogShell
        open={featureRequestsOpen}
        onOpenChange={setFeatureRequestsOpen}
        returnFocusRef={featureRequestReturnFocusRef}
      >
        {featureRequestBody}
      </FeatureRequestDialogShell>
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

type DialogTriggerProps = Omit<ComponentProps<typeof Button>, "onClick"> & {
  children?: ReactNode
}

export function SettingsDialogTrigger({
  children = "Settings",
  ...props
}: DialogTriggerProps) {
  const { openSettings } = useProductDialogs()
  return (
    <Button
      onClick={(event) => openSettings("general", event.currentTarget)}
      {...props}
    >
      {children}
    </Button>
  )
}

export function FeatureRequestDialogTrigger({
  children = "Feature Requests",
  ...props
}: DialogTriggerProps) {
  const { openFeatureRequests } = useProductDialogs()
  return (
    <Button
      onClick={(event) => openFeatureRequests(event.currentTarget)}
      {...props}
    >
      {children}
    </Button>
  )
}
