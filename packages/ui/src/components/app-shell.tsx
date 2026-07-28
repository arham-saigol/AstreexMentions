import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import type * as React from "react"

import { cn } from "../lib/utils"

function SkipLink({ className, ...props }: React.ComponentProps<"a">) {
  return (
    <a
      className={cn(
        "bg-primary text-primary-foreground fixed top-3 left-3 z-[100] -translate-y-16 rounded-md px-3 py-2 text-sm font-medium shadow-md transition-transform focus:translate-y-0",
        className,
      )}
      {...props}
    />
  )
}

function AppShell({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="app-shell"
      className={cn(
        "bg-background min-h-dvh [--app-shell-sidebar-width:16rem] md:grid md:grid-cols-[var(--app-shell-sidebar-width)_minmax(0,1fr)]",
        className,
      )}
      {...props}
    />
  )
}

function AppShellSidebar({
  className,
  ...props
}: React.ComponentProps<"aside">) {
  return (
    <aside
      data-slot="app-shell-sidebar"
      className={cn(
        "border-sidebar-border bg-sidebar text-sidebar-foreground hidden border-r md:sticky md:top-0 md:flex md:h-dvh md:flex-col",
        className,
      )}
      {...props}
    />
  )
}

function AppShellSidebarHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="app-shell-sidebar-header"
      className={cn(
        "border-sidebar-border flex h-16 shrink-0 items-center border-b px-4",
        className,
      )}
      {...props}
    />
  )
}

function AppShellSidebarContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="app-shell-sidebar-content"
      className={cn("min-h-0 flex-1 overflow-y-auto px-3 py-4", className)}
      {...props}
    />
  )
}

function AppShellSidebarFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="app-shell-sidebar-footer"
      className={cn("border-sidebar-border shrink-0 border-t p-3", className)}
      {...props}
    />
  )
}

function AppShellBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="app-shell-body"
      className={cn("flex min-h-dvh min-w-0 flex-col", className)}
      {...props}
    />
  )
}

function AppShellHeader({
  className,
  ...props
}: React.ComponentProps<"header">) {
  return (
    <header
      data-slot="app-shell-header"
      className={cn(
        "border-border bg-background sticky top-0 z-40 flex h-16 shrink-0 items-center gap-3 border-b px-4 md:px-6",
        className,
      )}
      {...props}
    />
  )
}

function AppShellMain({
  className,
  id = "main-content",
  ...props
}: React.ComponentProps<"main">) {
  return (
    <main
      id={id}
      data-slot="app-shell-main"
      tabIndex={-1}
      className={cn(
        "min-w-0 flex-1 px-4 py-6 pb-24 outline-none md:px-6 md:pb-6",
        className,
      )}
      {...props}
    />
  )
}

function AppShellContainer({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="app-shell-container"
      className={cn("mx-auto w-full max-w-7xl", className)}
      {...props}
    />
  )
}

function AppShellNav({ className, ...props }: React.ComponentProps<"nav">) {
  return (
    <nav
      data-slot="app-shell-nav"
      className={cn("space-y-1", className)}
      {...props}
    />
  )
}

const appShellNavItemVariants = cva(
  "flex h-9 w-full items-center gap-3 rounded-md px-3 text-sm font-medium text-sidebar-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      active: {
        true: "bg-sidebar-accent text-sidebar-accent-foreground",
        false: "",
      },
    },
    defaultVariants: {
      active: false,
    },
  },
)

function AppShellNavItem({
  className,
  active,
  asChild = false,
  type,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof appShellNavItemVariants> & {
    asChild?: boolean
  }) {
  const Component = asChild ? Slot : "button"

  return (
    <Component
      data-slot="app-shell-nav-item"
      data-active={active || undefined}
      className={cn(appShellNavItemVariants({ active }), className)}
      {...(!asChild && { type: type ?? "button" })}
      {...(active && { "aria-current": "page" as const })}
      {...props}
    />
  )
}

function AppShellMobileNav({
  className,
  ...props
}: React.ComponentProps<"nav">) {
  return (
    <nav
      data-slot="app-shell-mobile-nav"
      className={cn(
        "border-border bg-background fixed inset-x-0 bottom-0 z-40 flex min-h-16 items-center justify-around border-t px-2 pb-[env(safe-area-inset-bottom)] md:hidden",
        className,
      )}
      {...props}
    />
  )
}

function AppShellMobileNavItem({
  className,
  active,
  asChild = false,
  type,
  ...props
}: React.ComponentProps<"button"> & {
  active?: boolean
  asChild?: boolean
}) {
  const Component = asChild ? Slot : "button"

  return (
    <Component
      data-slot="app-shell-mobile-nav-item"
      data-active={active || undefined}
      className={cn(
        "text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring data-[active=true]:text-primary flex min-h-11 min-w-16 flex-col items-center justify-center gap-1 rounded-md px-2 text-[0.6875rem] font-medium outline-none focus-visible:ring-2 [&_svg]:size-5",
        className,
      )}
      {...(!asChild && { type: type ?? "button" })}
      {...(active && { "aria-current": "page" as const })}
      {...props}
    />
  )
}

export {
  AppShell,
  AppShellBody,
  AppShellContainer,
  AppShellHeader,
  AppShellMain,
  AppShellMobileNav,
  AppShellMobileNavItem,
  AppShellNav,
  AppShellNavItem,
  AppShellSidebar,
  AppShellSidebarContent,
  AppShellSidebarFooter,
  AppShellSidebarHeader,
  SkipLink,
  appShellNavItemVariants,
}
