"use client"

import type { Icon } from "@phosphor-icons/react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@astreex/ui/components/dialog"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@astreex/ui/components/tabs"
import { useState, type ReactNode, type RefObject } from "react"

export type SettingsSectionId =
  "general" | "categories" | "billing" | "usage" | "digest"

export type SettingsDialogSection = {
  description: string
  icon: Icon
  id: SettingsSectionId
  label: string
  render: () => ReactNode
}

export function SettingsDialogBodySlot({
  children,
  description,
  title,
}: {
  children: ReactNode
  description: string
  title: string
}) {
  return (
    <section aria-labelledby="settings-section-title" className="min-w-0">
      <h3
        id="settings-section-title"
        className="text-foreground text-lg font-semibold tracking-tight"
      >
        {title}
      </h3>
      <p className="text-muted-foreground mt-1 text-sm leading-6">
        {description}
      </p>
      <div className="border-border mt-6 border-t pt-6">{children}</div>
    </section>
  )
}

export function SettingsDialogShell({
  initialSectionId = "general",
  onOpenChange,
  open,
  returnFocusRef,
  sections,
}: {
  initialSectionId?: SettingsSectionId
  onOpenChange: (open: boolean) => void
  open: boolean
  returnFocusRef?: RefObject<HTMLElement | null>
  sections: SettingsDialogSection[]
}) {
  const [activeSectionId, setActiveSectionId] =
    useState<SettingsSectionId>(initialSectionId)
  const activeSection =
    sections.find((section) => section.id === activeSectionId) ?? sections[0]

  if (!activeSection) {
    return null
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && sections.some((section) => section.id === "general")) {
          setActiveSectionId("general")
        }
        onOpenChange(nextOpen)
      }}
    >
      <DialogContent
        className="grid h-[min(48rem,calc(100dvh-1.5rem))] max-w-6xl grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:w-[calc(100%-3rem)]"
        onCloseAutoFocus={(event) => {
          const target = returnFocusRef?.current
          if (!target?.isConnected) {
            return
          }

          event.preventDefault()
          window.requestAnimationFrame(() => target.focus())
        }}
      >
        <DialogHeader className="border-border border-b px-5 py-5 pr-12 sm:px-6">
          <DialogTitle className="text-xl">Settings</DialogTitle>
          <DialogDescription>
            Manage this account, monitoring preferences, and billing.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeSection.id}
          onValueChange={(value) => {
            const section = sections.find((candidate) => candidate.id === value)
            if (section) setActiveSectionId(section.id)
          }}
          activationMode="automatic"
          className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-0 sm:grid-cols-[15rem_minmax(0,1fr)] sm:grid-rows-1"
        >
          <nav
            aria-label="Settings sections"
            className="border-border overflow-x-auto border-b p-2 sm:overflow-y-auto sm:border-r sm:border-b-0 sm:p-3"
          >
            <TabsList className="h-auto w-max justify-start gap-1 rounded-none bg-transparent p-0 sm:w-full sm:flex-col sm:items-stretch">
              {sections.map(({ icon: SectionIcon, id, label }) => (
                <TabsTrigger
                  key={id}
                  value={id}
                  className="h-10 flex-none justify-start px-3 data-[state=active]:shadow-none sm:w-full"
                >
                  <SectionIcon aria-hidden="true" className="size-4" />
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </nav>

          <div className="min-h-0 overflow-y-auto px-5 py-6 sm:px-8 sm:py-8">
            <TabsContent value={activeSection.id} className="mt-0">
              <SettingsDialogBodySlot
                title={activeSection.label}
                description={activeSection.description}
              >
                {activeSection.render()}
              </SettingsDialogBodySlot>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
