"use client"

import {
  CircleNotchIcon,
  FloppyDiskIcon,
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
  AlertDialogTrigger,
} from "@astreex/ui/components/alert-dialog"
import { Badge } from "@astreex/ui/components/badge"
import { Button } from "@astreex/ui/components/button"
import { Input } from "@astreex/ui/components/input"
import { Label } from "@astreex/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@astreex/ui/components/select"
import { Switch } from "@astreex/ui/components/switch"
import { Textarea } from "@astreex/ui/components/textarea"
import { useMutation, useQuery } from "convex/react"
import { useMemo, useState, type CSSProperties, type FormEvent } from "react"

import { customerConvex } from "@/lib/customer-convex"
import {
  categoryColorTokenSchema,
  settingsCategoriesResultSchema,
  type CategoryColorToken,
  type SettingsCategory,
} from "@/lib/settings-convex"

const colorOptions = [
  { value: "blue", label: "Blue" },
  { value: "orange", label: "Orange" },
  { value: "cyan", label: "Aqua" },
  { value: "yellow", label: "Yellow" },
  { value: "pink", label: "Pink" },
  { value: "green", label: "Green" },
  { value: "purple", label: "Violet" },
  { value: "red", label: "Red" },
  { value: "gray", label: "Gray" },
  { value: "slate", label: "Slate" },
] as const satisfies readonly { value: CategoryColorToken; label: string }[]

function ColorSwatch({ color }: { color: CategoryColorToken }) {
  return (
    <span
      aria-hidden="true"
      className="border-background size-3.5 shrink-0 rounded-full border-2 shadow-[0_0_0_1px_var(--border)]"
      style={
        {
          backgroundColor: `var(--category-token-${color})`,
        } as CSSProperties
      }
    />
  )
}

function CategoryRow({ category }: { category: SettingsCategory }) {
  const updateCategory = useMutation(customerConvex.categories.update)
  const removeCategory = useMutation(customerConvex.categories.remove)
  const [nameDraft, setNameDraft] = useState<string | null>(null)
  const [descriptionDraft, setDescriptionDraft] = useState<string | null>(null)
  const [colorTokenDraft, setColorTokenDraft] =
    useState<CategoryColorToken | null>(null)
  const name = nameDraft ?? category.name
  const description = descriptionDraft ?? category.description
  const colorToken = colorTokenDraft ?? category.colorToken
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const isOther = category.systemKey === "other"

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (isOther) {
      return
    }

    const normalizedName = name.trim()
    const normalizedDescription = description.trim()
    if (!normalizedName || !normalizedDescription) {
      setError("Name and description are required.")
      return
    }

    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      await updateCategory({
        categoryId: category.id,
        colorToken,
        description: normalizedDescription,
        name: normalizedName,
      })
      setMessage("Category saved.")
    } catch {
      setError(
        "This category could not be saved. Its name may already be in use.",
      )
    } finally {
      setSaving(false)
    }
  }

  const setEnabled = async (enabled: boolean) => {
    if (isOther) {
      return
    }

    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      await updateCategory({ categoryId: category.id, enabled })
      setMessage(enabled ? "Category enabled." : "Category disabled.")
    } catch {
      setError("The category state could not be changed.")
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (category.isSystem) {
      return
    }

    setRemoving(true)
    setError(null)
    try {
      await removeCategory({ categoryId: category.id })
    } catch {
      setError("The custom category could not be deleted.")
      setRemoving(false)
    }
  }

  return (
    <form
      onSubmit={save}
      className="border-border border-t py-6 first:border-t-0 first:pt-0"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <ColorSwatch color={category.colorToken} />
          <h4 className="text-foreground truncate text-sm font-semibold">
            {category.name}
          </h4>
          <Badge variant={category.isSystem ? "muted" : "outline"}>
            {category.isSystem ? "Default" : "Custom"}
          </Badge>
          {isOther && <Badge variant="outline">Required</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <Label
            htmlFor={`category-enabled-${category.id}`}
            className="text-muted-foreground text-xs"
          >
            {category.enabled ? "Enabled" : "Disabled"}
          </Label>
          <Switch
            id={`category-enabled-${category.id}`}
            checked={category.enabled}
            onCheckedChange={(checked) => void setEnabled(checked)}
            disabled={saving || isOther}
            aria-label={`${category.enabled ? "Disable" : "Enable"} ${category.name}`}
          />
        </div>
      </div>

      {isOther ? (
        <div className="bg-muted/35 border-border mt-4 rounded-md border px-4 py-3">
          <p className="text-foreground text-sm font-medium">
            {category.description}
          </p>
          <p className="text-muted-foreground mt-1 text-xs leading-5">
            Other is immutable and remains enabled as the required fallback when
            no other category fits.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_11rem]">
            <div className="space-y-2">
              <Label htmlFor={`category-name-${category.id}`}>Name</Label>
              <Input
                id={`category-name-${category.id}`}
                value={name}
                onChange={(event) => setNameDraft(event.target.value)}
                maxLength={80}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`category-color-${category.id}`}>Color</Label>
              <Select
                value={colorToken}
                onValueChange={(value) => {
                  const parsed = categoryColorTokenSchema.safeParse(value)
                  if (parsed.success) setColorTokenDraft(parsed.data)
                }}
              >
                <SelectTrigger
                  id={`category-color-${category.id}`}
                  className="w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {colorOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <ColorSwatch color={option.value} />
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <Label htmlFor={`category-description-${category.id}`}>
              Description
            </Label>
            <Textarea
              id={`category-description-${category.id}`}
              value={description}
              onChange={(event) => setDescriptionDraft(event.target.value)}
              maxLength={300}
              className="min-h-20"
            />
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div aria-live="polite">
              {error && (
                <p role="alert" className="text-destructive text-xs">
                  {error}
                </p>
              )}
              {message && (
                <p className="text-muted-foreground text-xs">{message}</p>
              )}
            </div>
            <div className="ml-auto flex gap-2">
              {!category.isSystem && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={saving || removing}
                    >
                      <TrashIcon />
                      Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Delete {category.name}?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        This removes the custom category. Existing mentions
                        retain their source content but can no longer use this
                        category.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction asChild>
                        <Button
                          variant="destructive"
                          onClick={() => void remove()}
                          disabled={removing}
                        >
                          {removing && (
                            <CircleNotchIcon className="animate-spin" />
                          )}
                          Delete category
                        </Button>
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              <Button
                type="submit"
                variant="outline"
                size="sm"
                disabled={saving || removing}
              >
                {saving ? (
                  <CircleNotchIcon className="animate-spin" />
                ) : (
                  <FloppyDiskIcon />
                )}
                Save
              </Button>
            </div>
          </div>
        </>
      )}
    </form>
  )
}

function CreateCategory() {
  const createCategory = useMutation(customerConvex.categories.create)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [colorToken, setColorToken] = useState<CategoryColorToken>("blue")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const create = async (event: FormEvent) => {
    event.preventDefault()
    const normalizedName = name.trim()
    const normalizedDescription = description.trim()
    if (!normalizedName || !normalizedDescription) {
      setError("Name and description are required.")
      return
    }

    setSaving(true)
    setError(null)
    try {
      await createCategory({
        colorToken,
        description: normalizedDescription,
        name: normalizedName,
      })
      setName("")
      setDescription("")
      setColorToken("blue")
      setOpen(false)
    } catch {
      setError(
        "The custom category could not be created. Its name may already exist.",
      )
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <PlusIcon />
        New category
      </Button>
    )
  }

  return (
    <form
      onSubmit={create}
      className="border-border bg-muted/25 rounded-lg border p-4 sm:p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-foreground text-sm font-semibold">
          New custom category
        </h4>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen(false)}
          disabled={saving}
        >
          Cancel
        </Button>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_11rem]">
        <div className="space-y-2">
          <Label htmlFor="new-category-name">Name</Label>
          <Input
            id="new-category-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-category-color">Color</Label>
          <Select
            value={colorToken}
            onValueChange={(value) => {
              const parsed = categoryColorTokenSchema.safeParse(value)
              if (parsed.success) setColorToken(parsed.data)
            }}
          >
            <SelectTrigger id="new-category-color" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {colorOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  <ColorSwatch color={option.value} />
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <Label htmlFor="new-category-description">Description</Label>
        <Textarea
          id="new-category-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={300}
          className="min-h-20"
        />
      </div>
      {error && (
        <p role="alert" className="text-destructive mt-3 text-xs">
          {error}
        </p>
      )}
      <Button type="submit" className="mt-4" disabled={saving}>
        {saving ? <CircleNotchIcon className="animate-spin" /> : <PlusIcon />}
        Create category
      </Button>
    </form>
  )
}

export function CategorySettings() {
  const value = useQuery(customerConvex.categories.list, {})
  const parsed = useMemo(
    () =>
      value === undefined
        ? null
        : settingsCategoriesResultSchema.safeParse(value),
    [value],
  )

  if (value === undefined) {
    return (
      <p role="status" className="text-muted-foreground text-sm">
        Loading categories…
      </p>
    )
  }

  if (!parsed?.success) {
    return (
      <div
        role="alert"
        className="border-border bg-muted/35 rounded-md border px-4 py-4"
      >
        <p className="text-foreground text-sm font-medium">
          Categories are unavailable.
        </p>
        <p className="text-muted-foreground mt-1 text-xs leading-5">
          The connected result could not be validated, so Astreex is not showing
          or editing guessed category data.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="text-muted-foreground max-w-xl text-sm leading-6">
          Enable or disable default categories, rename eligible categories, and
          add custom labels. Color is always paired with a visible name.
        </p>
        <CreateCategory />
      </div>
      <div className="mt-6">
        {parsed.data.map((category) => (
          <CategoryRow key={category.id} category={category} />
        ))}
      </div>
    </div>
  )
}
