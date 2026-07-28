"use client"

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  DotsThreeIcon,
  FunnelSimpleIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@astreex/ui/components/alert-dialog"
import { Badge } from "@astreex/ui/components/badge"
import { Button } from "@astreex/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@astreex/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@astreex/ui/components/dropdown-menu"
import { Input } from "@astreex/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@astreex/ui/components/select"
import { cn } from "@astreex/ui/lib/utils"
import { useState } from "react"

import { MentionFilterPopover } from "@/components/mentions/mention-filter-popover"
import {
  copyMentionFilters,
  mentionFilterCount,
  type MentionCategory,
  type MentionFilters,
  type MentionKeyword,
  type MentionSort,
  type SavedView,
} from "@/lib/mentions"

type ViewDialog =
  { mode: "create" } | { mode: "rename" | "edit"; view: SavedView } | null

function SavedViewEditor({
  categories,
  currentFilters,
  currentSort,
  dialog,
  keywords,
  onClose,
  onCreate,
  onUpdate,
}: {
  categories: MentionCategory[]
  currentFilters: MentionFilters
  currentSort: MentionSort
  dialog: Exclude<ViewDialog, null>
  keywords: MentionKeyword[]
  onClose: () => void
  onCreate: (input: {
    filters: MentionFilters
    icon: string
    name: string
    sort: MentionSort
  }) => Promise<void>
  onUpdate: (
    savedViewId: string,
    patch: { filters?: MentionFilters; name?: string; sort?: MentionSort },
  ) => Promise<void>
}) {
  const sourceView = dialog.mode === "create" ? null : dialog.view
  const [name, setName] = useState(sourceView?.name ?? "")
  const [filters, setFilters] = useState<MentionFilters>(() =>
    copyMentionFilters(sourceView?.filters ?? currentFilters),
  )
  const [sort, setSort] = useState<MentionSort>(sourceView?.sort ?? currentSort)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const changesFilters = dialog.mode !== "rename"
  const changesName = dialog.mode !== "edit"
  const title =
    dialog.mode === "create"
      ? "Create saved view"
      : dialog.mode === "rename"
        ? "Rename saved view"
        : "Edit saved view filters"
  const description =
    dialog.mode === "create"
      ? "Save a reusable view of the mentions already collected for this account."
      : dialog.mode === "rename"
        ? "Update the label shown in the ordered saved views row."
        : "Change the filters and sort used to query the existing mentions feed."
  const filterCount = mentionFilterCount(filters)

  const submit = async () => {
    const trimmedName = name.trim()
    if (changesName && !trimmedName) {
      setError("Enter a name for this saved view.")
      return
    }

    setBusy(true)
    setError(null)
    try {
      if (dialog.mode === "create") {
        await onCreate({
          filters,
          icon: "funnel",
          name: trimmedName,
          sort,
        })
      } else if (dialog.mode === "rename") {
        await onUpdate(dialog.view.id, { name: trimmedName })
      } else {
        await onUpdate(dialog.view.id, { filters, sort })
      }
      onClose()
    } catch {
      setError("The saved view could not be updated. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {changesName && (
            <label className="text-foreground block text-sm font-medium">
              View name
              <Input
                autoFocus
                value={name}
                maxLength={80}
                placeholder="Launch feedback"
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                    event.preventDefault()
                    void submit()
                  }
                }}
                className="mt-2"
              />
            </label>
          )}

          {changesFilters && (
            <div className="border-border rounded-md border p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-foreground text-sm font-medium">
                    Feed filters
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {filterCount === 0
                      ? "No filters — all collected mentions."
                      : `${filterCount} filter ${filterCount === 1 ? "selection" : "selections"}.`}
                  </p>
                </div>
                <MentionFilterPopover
                  categories={categories}
                  filters={filters}
                  keywords={keywords}
                  onApply={setFilters}
                />
              </div>

              <label className="text-foreground mt-4 block text-sm font-medium">
                Sort order
                <Select
                  value={sort}
                  onValueChange={(value) => setSort(value as MentionSort)}
                >
                  <SelectTrigger
                    aria-label="Sort order"
                    className="mt-2 w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest first</SelectItem>
                    <SelectItem value="oldest">Oldest first</SelectItem>
                    <SelectItem value="most_engaged">Most engaged</SelectItem>
                  </SelectContent>
                </Select>
              </label>
            </div>
          )}

          {error && (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {busy
              ? "Saving…"
              : dialog.mode === "create"
                ? "Create view"
                : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function SavedViews({
  categories,
  currentFilters,
  currentSort,
  keywords,
  onCreate,
  onDelete,
  onReorder,
  onSelectAll,
  onSelectView,
  onUpdate,
  selectedViewId,
  views,
}: {
  categories: MentionCategory[]
  currentFilters: MentionFilters
  currentSort: MentionSort
  keywords: MentionKeyword[]
  onCreate: (input: {
    filters: MentionFilters
    icon: string
    name: string
    sort: MentionSort
  }) => Promise<void>
  onDelete: (savedViewId: string) => Promise<void>
  onReorder: (savedViewIds: string[]) => Promise<void>
  onSelectAll: () => void
  onSelectView: (view: SavedView) => void
  onUpdate: (
    savedViewId: string,
    patch: { filters?: MentionFilters; name?: string; sort?: MentionSort },
  ) => Promise<void>
  selectedViewId: string | null
  views: SavedView[]
}) {
  const [dialog, setDialog] = useState<ViewDialog>(null)
  const [deleteView, setDeleteView] = useState<SavedView | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [rowError, setRowError] = useState<string | null>(null)

  const reorder = async (view: SavedView, offset: -1 | 1) => {
    const index = views.findIndex((candidate) => candidate.id === view.id)
    const targetIndex = index + offset
    if (index < 0 || targetIndex < 0 || targetIndex >= views.length) {
      return
    }

    const ids = views.map((candidate) => candidate.id)
    const [moved] = ids.splice(index, 1)
    if (!moved) {
      return
    }
    ids.splice(targetIndex, 0, moved)

    setRowError(null)
    try {
      await onReorder(ids)
    } catch {
      setRowError("Saved views could not be reordered.")
    }
  }

  const confirmDelete = async () => {
    if (!deleteView) return
    setDeleteBusy(true)
    setRowError(null)
    try {
      await onDelete(deleteView.id)
      setDeleteView(null)
    } catch {
      setRowError("The saved view could not be deleted.")
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <section
      aria-labelledby="saved-views-label"
      className="border-border border-b py-3"
    >
      <div className="flex items-center gap-3">
        <p
          id="saved-views-label"
          className="text-muted-foreground hidden shrink-0 text-xs font-semibold tracking-wide uppercase sm:block"
        >
          Views
        </p>
        <div className="min-w-0 flex-1 overflow-x-auto pb-1">
          <div className="flex w-max items-center gap-2">
            <Button
              size="sm"
              variant={selectedViewId === null ? "secondary" : "ghost"}
              aria-pressed={selectedViewId === null}
              onClick={onSelectAll}
            >
              <FunnelSimpleIcon aria-hidden="true" />
              All Mentions
            </Button>

            {views.map((view, index) => {
              const active = selectedViewId === view.id
              const filterCount = mentionFilterCount(view.filters)
              return (
                <div
                  key={view.id}
                  className={cn(
                    "border-border flex items-center rounded-md border",
                    active ? "bg-secondary" : "bg-background",
                  )}
                >
                  <button
                    type="button"
                    aria-pressed={active}
                    className={cn(
                      "focus-visible:ring-ring inline-flex h-8 max-w-56 items-center gap-2 rounded-l-md px-3 text-xs font-medium outline-none focus-visible:ring-2",
                      active
                        ? "text-secondary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                    onClick={() => onSelectView(view)}
                  >
                    <span className="truncate">{view.name}</span>
                    {filterCount > 0 && (
                      <Badge variant="muted" className="px-1.5">
                        {filterCount}
                      </Badge>
                    )}
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="rounded-l-none border-l"
                        aria-label={`Manage ${view.name} saved view`}
                      >
                        <DotsThreeIcon aria-hidden="true" weight="bold" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-48">
                      <DropdownMenuItem
                        onSelect={() => setDialog({ mode: "rename", view })}
                      >
                        <PencilSimpleIcon aria-hidden="true" />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => setDialog({ mode: "edit", view })}
                      >
                        <FunnelSimpleIcon aria-hidden="true" />
                        Edit filters
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        disabled={index === 0}
                        onSelect={() => void reorder(view, -1)}
                      >
                        <ArrowLeftIcon aria-hidden="true" />
                        Move left
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={index === views.length - 1}
                        onSelect={() => void reorder(view, 1)}
                      >
                        <ArrowRightIcon aria-hidden="true" />
                        Move right
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => setDeleteView(view)}
                      >
                        <TrashIcon aria-hidden="true" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )
            })}

            <Button
              size="sm"
              variant="outline"
              onClick={() => setDialog({ mode: "create" })}
            >
              <PlusIcon aria-hidden="true" />
              Add view
            </Button>
          </div>
        </div>
      </div>

      {rowError && (
        <p className="text-destructive mt-2 text-xs" role="alert">
          {rowError}
        </p>
      )}

      {dialog && (
        <SavedViewEditor
          key={
            dialog.mode === "create"
              ? "create"
              : `${dialog.mode}-${dialog.view.id}`
          }
          categories={categories}
          currentFilters={currentFilters}
          currentSort={currentSort}
          dialog={dialog}
          keywords={keywords}
          onClose={() => setDialog(null)}
          onCreate={onCreate}
          onUpdate={onUpdate}
        />
      )}

      <AlertDialog
        open={deleteView !== null}
        onOpenChange={(open) => !open && !deleteBusy && setDeleteView(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete saved view?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteView
                ? `“${deleteView.name}” will be removed. The underlying mentions are not deleted.`
                : "This saved view will be removed."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteBusy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault()
                void confirmDelete()
              }}
            >
              {deleteBusy ? "Deleting…" : "Delete view"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
