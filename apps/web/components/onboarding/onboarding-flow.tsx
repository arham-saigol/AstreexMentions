"use client"

import { PLAN_DEFINITIONS, type PlanId } from "@astreex/domain"
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  AtIcon,
  CheckCircleIcon,
  CheckIcon,
  CircleNotchIcon,
  CreditCardIcon,
  KeyIcon,
  MagnifyingGlassIcon,
  NewspaperIcon,
  PlusIcon,
  RedditLogoIcon,
  ShieldCheckIcon,
  TrashIcon,
  WarningCircleIcon,
  XLogoIcon,
} from "@phosphor-icons/react"
import { Button } from "@astreex/ui/components/button"
import { Checkbox } from "@astreex/ui/components/checkbox"
import { Input } from "@astreex/ui/components/input"
import { Label } from "@astreex/ui/components/label"
import { Progress } from "@astreex/ui/components/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@astreex/ui/components/select"
import { StatusState } from "@astreex/ui/components/status-state"
import { Switch } from "@astreex/ui/components/switch"
import { Textarea } from "@astreex/ui/components/textarea"
import { cn } from "@astreex/ui/lib/utils"
import { useAction, useConvex, useMutation, useQuery } from "convex/react"
import { useRouter } from "next/navigation"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react"

import { useProductContext } from "@/components/product/product-context"
import { billingOverviewResultSchema } from "@/lib/customer-convex"
import {
  createOnboardingDraft,
  draftStorageKey,
  MAX_DRAFT_KEYWORDS,
  normalizeKeywordPhrase,
  ONBOARDING_STEP_COUNT,
  onboardingDraftSchema,
  type OnboardingCategoryDraft,
  type OnboardingDraft,
  type OnboardingKeywordDraft,
  type OnboardingStep,
} from "@/lib/onboarding-draft"
import {
  categoryListResultSchema,
  checkoutResultSchema,
  keywordListResultSchema,
  onboardingConfigurationResultSchema,
  onboardingConvex,
  type CategoryColorToken,
  type CategoryResult,
  type KeywordResult,
  type OnboardingPlatform,
} from "@/lib/onboarding-convex"

const steps = [
  { label: "Outcome", title: "Welcome" },
  { label: "Your signal", title: "Brand keywords" },
  { label: "Market signal", title: "Other keywords" },
  { label: "Sources", title: "Platforms" },
  { label: "Categories", title: "Categories" },
  { label: "Preview", title: "Monitoring preview" },
  { label: "Activation", title: "Choose a plan" },
] as const

const platformOptions = [
  {
    description: "Public posts and replies on X",
    icon: XLogoIcon,
    label: "X",
    value: "x",
  },
  {
    description: "Relevant Reddit posts and comments",
    icon: RedditLogoIcon,
    label: "Reddit",
    value: "reddit",
  },
  {
    description: "Stories and comments on Hacker News",
    icon: NewspaperIcon,
    label: "Hacker News",
    value: "hacker_news",
  },
] as const satisfies readonly {
  description: string
  icon: typeof XLogoIcon
  label: string
  value: OnboardingPlatform
}[]

const colorOptions = [
  { label: "Blue", value: "blue", dot: "bg-blue-600" },
  { label: "Orange", value: "orange", dot: "bg-orange-600" },
  { label: "Green", value: "green", dot: "bg-green-600" },
  { label: "Red", value: "red", dot: "bg-red-600" },
  { label: "Purple", value: "purple", dot: "bg-purple-600" },
  { label: "Yellow", value: "yellow", dot: "bg-yellow-500" },
  { label: "Gray", value: "gray", dot: "bg-gray-500" },
  { label: "Pink", value: "pink", dot: "bg-pink-600" },
  { label: "Cyan", value: "cyan", dot: "bg-cyan-600" },
  { label: "Slate", value: "slate", dot: "bg-slate-600" },
] as const satisfies readonly {
  dot: string
  label: string
  value: CategoryColorToken
}[]

const planById = new Map(PLAN_DEFINITIONS.map((plan) => [plan.id, plan]))

function createClientId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }

  return `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function createCheckoutKey(workspaceId: string, planId: PlanId): string {
  const random = createClientId()
  return `web:${workspaceId}:${planId}:${random}`.slice(0, 200)
}

function smallestPlanFor(keywordCount: number): PlanId {
  return (
    PLAN_DEFINITIONS.find((plan) => keywordCount <= plan.keywordLimit)?.id ??
    "scale"
  )
}

function categoryDraftFromResult(
  category: CategoryResult,
): OnboardingCategoryDraft {
  return {
    colorToken: category.colorToken,
    description: category.description,
    enabled: category.enabled,
    isSystem: category.isSystem,
    name: category.name,
    serverId: category.id,
    ...(category.systemKey ? { systemKey: category.systemKey } : {}),
  }
}

function keywordDraftFromResult(
  keyword: KeywordResult,
): OnboardingKeywordDraft {
  return {
    clientId: keyword.id,
    kind: "own",
    phrase: keyword.phrase,
    platforms: keyword.platforms,
  }
}

function writeDraftToStorage(key: string, draft: OnboardingDraft): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(draft))
  } catch {
    // The in-memory draft remains usable when browser storage is unavailable.
  }
}

function readDraftFromStorage(key: string): OnboardingDraft | null {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) {
      return null
    }

    const parsed = onboardingDraftSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

function duplicateKeyword(draft: OnboardingDraft): string | null {
  const seen = new Set<string>()
  for (const keyword of draft.keywords) {
    const normalized = normalizeKeywordPhrase(keyword.phrase)
    if (!normalized) {
      continue
    }
    if (seen.has(normalized)) {
      return keyword.phrase.trim()
    }
    seen.add(normalized)
  }
  return null
}

function validateStep(
  draft: OnboardingDraft,
  step: OnboardingStep,
): string | null {
  const ownKeywords = draft.keywords.filter((keyword) => keyword.kind === "own")
  const otherKeywords = draft.keywords.filter(
    (keyword) => keyword.kind === "other",
  )
  const duplicate = duplicateKeyword(draft)

  if (step === 2) {
    if (!draft.workspaceName.trim()) {
      return "Enter the brand name this signal belongs to."
    }
    if (ownKeywords.length === 0) {
      return "Add at least one brand, product, or personal keyword."
    }
    if (
      ownKeywords.some((keyword) => !normalizeKeywordPhrase(keyword.phrase))
    ) {
      return "Every brand keyword needs a phrase."
    }
    if (duplicate) {
      return `“${duplicate}” is already in this configuration.`
    }
  }

  if (step === 3) {
    if (
      otherKeywords.some((keyword) => !normalizeKeywordPhrase(keyword.phrase))
    ) {
      return "Remove empty market keywords or enter a phrase for each one."
    }
    if (duplicate) {
      return `“${duplicate}” is already in this configuration.`
    }
  }

  if (step === 4) {
    if (draft.keywords.length === 0) {
      return "Add at least one keyword before choosing platforms."
    }
    const withoutPlatform = draft.keywords.find(
      (keyword) => keyword.platforms.length === 0,
    )
    if (withoutPlatform) {
      return `Choose at least one platform for “${withoutPlatform.phrase}”.`
    }
  }

  if (step === 5) {
    if (draft.categories.length === 0) {
      return "Categories have not loaded from the account yet."
    }
    const incomplete = draft.categories.find(
      (category) => !category.description.trim(),
    )
    if (incomplete) {
      return `Add a description for ${incomplete.name}.`
    }
    const other = draft.categories.find(
      (category) => category.systemKey === "other",
    )
    if (!other || !other.enabled || other.name !== "Other") {
      return "The required Other category must remain enabled and unchanged."
    }
  }

  if (step === 6 && !draft.configurationSavedAt) {
    return "Save the configuration before opening its monitoring preview."
  }

  if (step === 7) {
    if (!draft.selectedPlan) {
      return "Choose a plan before continuing to checkout."
    }
    const plan = planById.get(draft.selectedPlan)
    if (!plan || draft.keywords.length > plan.keywordLimit) {
      return "Choose a plan that fits every configured keyword."
    }
  }

  return null
}

function StepHeading({
  description,
  eyebrow,
  title,
}: {
  description: ReactNode
  eyebrow: string
  title: string
}) {
  return (
    <div className="border-border border-b pb-5">
      <p className="text-primary text-xs font-semibold tracking-wide uppercase">
        {eyebrow}
      </p>
      <h1 className="text-foreground mt-2 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
        {title}
      </h1>
      <div className="text-muted-foreground mt-3 max-w-2xl text-sm leading-6">
        {description}
      </div>
    </div>
  )
}

function KeywordEditor({
  count,
  items,
  kind,
  onAdd,
  onRemove,
}: {
  count: number
  items: OnboardingKeywordDraft[]
  kind: OnboardingKeywordDraft["kind"]
  onAdd: (kind: OnboardingKeywordDraft["kind"], phrase: string) => string | null
  onRemove: (clientId: string) => void
}) {
  const [phrase, setPhrase] = useState("")
  const [error, setError] = useState<string | null>(null)
  const label = kind === "own" ? "brand keyword" : "market keyword"

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const result = onAdd(kind, phrase)
    if (result) {
      setError(result)
      return
    }
    setPhrase("")
    setError(null)
  }

  return (
    <div>
      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
        <div className="min-w-0 flex-1">
          <Label htmlFor={`${kind}-keyword`} className="sr-only">
            Add {label}
          </Label>
          <Input
            id={`${kind}-keyword`}
            value={phrase}
            onChange={(event) => {
              setPhrase(event.target.value)
              setError(null)
            }}
            placeholder={
              kind === "own"
                ? "Your brand, product, founder, or domain"
                : "Competitor, alternative, or problem phrase"
            }
            maxLength={160}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${kind}-keyword-error` : undefined}
          />
        </div>
        <Button
          type="submit"
          variant="outline"
          disabled={count >= MAX_DRAFT_KEYWORDS}
        >
          <PlusIcon aria-hidden="true" />
          Add keyword
        </Button>
      </form>
      {error && (
        <p
          id={`${kind}-keyword-error`}
          className="text-destructive mt-2 text-xs"
        >
          {error}
        </p>
      )}

      {items.length > 0 ? (
        <ul className="border-border mt-5 divide-y border-y">
          {items.map((keyword) => (
            <li key={keyword.clientId} className="flex items-center gap-3 py-3">
              <span className="border-border bg-muted text-muted-foreground grid size-8 shrink-0 place-items-center rounded-md border">
                {kind === "own" ? (
                  <KeyIcon aria-hidden="true" className="size-4" />
                ) : (
                  <MagnifyingGlassIcon aria-hidden="true" className="size-4" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-foreground block truncate text-sm font-medium">
                  {keyword.phrase}
                </span>
                <span className="text-muted-foreground block text-xs">
                  Platforms chosen in the next step
                </span>
              </span>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => onRemove(keyword.clientId)}
                aria-label={`Remove ${keyword.phrase}`}
              >
                <TrashIcon aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="border-border text-muted-foreground mt-5 border-y py-5 text-sm">
          {kind === "own"
            ? "No brand keywords added yet."
            : "No competitor or market keywords added. You may continue without them."}
        </p>
      )}
    </div>
  )
}

function WelcomeStep({ workspaceName }: { workspaceName: string }) {
  return (
    <div>
      <StepHeading
        eyebrow="Astreex setup"
        title={`Build a focused customer signal for ${workspaceName}.`}
        description="Configuration comes first. You will define what matters, where Astreex should look, and how conversations should be organized before a plan can activate collection."
      />
      <ul className="border-border bg-border mt-7 grid gap-px overflow-hidden rounded-lg border sm:grid-cols-3">
        {[
          {
            description:
              "Add up to ten precise phrases without collecting anything yet.",
            icon: KeyIcon,
            title: "Define the signal",
          },
          {
            description: "Assign X, Reddit, or Hacker News to every keyword.",
            icon: MagnifyingGlassIcon,
            title: "Choose the sources",
          },
          {
            description:
              "Review the empty dashboard before checkout is offered.",
            icon: ShieldCheckIcon,
            title: "Verify before paying",
          },
        ].map(({ description, icon: Icon, title }) => (
          <li key={title} className="bg-background p-5">
            <Icon aria-hidden="true" className="text-primary size-5" />
            <h2 className="text-foreground mt-4 text-sm font-semibold">
              {title}
            </h2>
            <p className="text-muted-foreground mt-1.5 text-sm leading-6">
              {description}
            </p>
          </li>
        ))}
      </ul>
      <StatusState
        className="mt-6"
        title="Nothing is being monitored yet"
        description="Saving this draft does not create mentions or imply an active subscription. Convex remains the authorization boundary for the configuration written at the review step."
      />
    </div>
  )
}

function OwnKeywordsStep({
  draft,
  onAdd,
  onRemove,
  onWorkspaceNameChange,
}: {
  draft: OnboardingDraft
  onAdd: (kind: OnboardingKeywordDraft["kind"], phrase: string) => string | null
  onRemove: (clientId: string) => void
  onWorkspaceNameChange: (value: string) => void
}) {
  const items = draft.keywords.filter((keyword) => keyword.kind === "own")

  return (
    <div>
      <StepHeading
        eyebrow="Your signal"
        title="Start with your own brand and product language."
        description="Add phrases people use when they refer to you directly. At least one is required; short, specific phrases usually create a clearer signal."
      />
      <div className="mt-6">
        <Label htmlFor="workspace-name">Brand name</Label>
        <Input
          id="workspace-name"
          value={draft.workspaceName}
          onChange={(event) => onWorkspaceNameChange(event.target.value)}
          maxLength={160}
          className="mt-2 max-w-md"
        />
        <p className="text-muted-foreground mt-2 text-xs leading-5">
          This label appears in the customer dashboard. It is not a keyword
          unless you add it below.
        </p>
      </div>
      <div className="mt-7">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-foreground text-sm font-semibold">
              Brand and personal keywords
            </h2>
            <p className="text-muted-foreground mt-1 text-xs">
              Examples: company name, product name, founder name, or domain.
            </p>
          </div>
          <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
            {draft.keywords.length}/{MAX_DRAFT_KEYWORDS}
          </span>
        </div>
        <KeywordEditor
          count={draft.keywords.length}
          items={items}
          kind="own"
          onAdd={onAdd}
          onRemove={onRemove}
        />
      </div>
    </div>
  )
}

function OtherKeywordsStep({
  draft,
  onAdd,
  onRemove,
}: {
  draft: OnboardingDraft
  onAdd: (kind: OnboardingKeywordDraft["kind"], phrase: string) => string | null
  onRemove: (clientId: string) => void
}) {
  const items = draft.keywords.filter((keyword) => keyword.kind === "other")

  return (
    <div>
      <StepHeading
        eyebrow="Market signal"
        title="Add competitors, alternatives, and problem phrases."
        description="This second group broadens the signal beyond direct brand mentions. It is optional, and all keywords still share the ten-keyword draft limit."
      />
      <div className="mt-7">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-foreground text-sm font-semibold">
              Competitor and other keywords
            </h2>
            <p className="text-muted-foreground mt-1 text-xs">
              Include named alternatives or the exact language of the problem.
            </p>
          </div>
          <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
            {draft.keywords.length}/{MAX_DRAFT_KEYWORDS}
          </span>
        </div>
        <KeywordEditor
          count={draft.keywords.length}
          items={items}
          kind="other"
          onAdd={onAdd}
          onRemove={onRemove}
        />
      </div>
    </div>
  )
}

function PlatformsStep({
  keywords,
  onToggle,
}: {
  keywords: OnboardingKeywordDraft[]
  onToggle: (
    clientId: string,
    platform: OnboardingPlatform,
    checked: boolean,
  ) => void
}) {
  return (
    <div>
      <StepHeading
        eyebrow="Sources"
        title="Choose at least one platform for every keyword."
        description="Selections are per keyword so a focused phrase does not have to run everywhere. Astreex will not save the configuration while any keyword has no source."
      />
      <ul className="border-border mt-6 divide-y border-y">
        {keywords.map((keyword) => (
          <li key={keyword.clientId} className="py-5">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
              <h2 className="text-foreground text-sm font-semibold">
                {keyword.phrase}
              </h2>
              <span className="text-muted-foreground text-xs">
                {keyword.kind === "own" ? "Brand signal" : "Market signal"}
              </span>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {platformOptions.map(
                ({ description, icon: Icon, label, value }) => {
                  const checked = keyword.platforms.includes(value)
                  const id = `${keyword.clientId}-${value}`
                  return (
                    <label
                      key={value}
                      htmlFor={id}
                      className={cn(
                        "border-border flex items-start gap-3 rounded-md border p-3 transition-colors",
                        checked && "border-primary bg-primary/5",
                        checked && keyword.platforms.length === 1
                          ? "cursor-not-allowed"
                          : "cursor-pointer",
                      )}
                    >
                      <Checkbox
                        id={id}
                        checked={checked}
                        disabled={checked && keyword.platforms.length === 1}
                        onCheckedChange={(next) =>
                          onToggle(keyword.clientId, value, next === true)
                        }
                        className="mt-0.5"
                      />
                      <span className="min-w-0">
                        <span className="text-foreground flex items-center gap-1.5 text-sm font-medium">
                          <Icon aria-hidden="true" className="size-4" />
                          {label}
                        </span>
                        <span className="text-muted-foreground mt-1 block text-xs leading-5">
                          {description}
                        </span>
                      </span>
                    </label>
                  )
                },
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function CategoriesStep({
  categories,
  loading,
  onChange,
}: {
  categories: OnboardingCategoryDraft[]
  loading: boolean
  onChange: (
    serverId: string,
    patch: Partial<
      Pick<OnboardingCategoryDraft, "colorToken" | "description" | "enabled">
    >,
  ) => void
}) {
  return (
    <div>
      <StepHeading
        eyebrow="Categories"
        title="Review the categories that organize each mention."
        description="Enable the categories you need, then tune their descriptions and colors. Other is the permanent fallback and cannot be disabled or customized."
      />
      {loading ? (
        <div
          className="text-muted-foreground flex items-center gap-2 py-10 text-sm"
          role="status"
        >
          <CircleNotchIcon aria-hidden="true" className="size-4 animate-spin" />
          Loading the account category catalog…
        </div>
      ) : (
        <ul className="border-border mt-6 divide-y border-y">
          {categories.map((category) => {
            const immutable = category.systemKey === "other"
            return (
              <li
                key={category.serverId}
                className={cn("py-5", !category.enabled && "opacity-70")}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="text-foreground text-sm font-semibold">
                      {category.name}
                    </h2>
                    <p className="text-muted-foreground mt-1 text-xs leading-5">
                      {immutable
                        ? "Required fallback. Name, state, description, and color stay fixed."
                        : category.enabled
                          ? "Enabled for categorization."
                          : "Disabled categories are not assigned to new mentions."}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label
                      htmlFor={`category-${category.serverId}`}
                      className="text-xs"
                    >
                      {category.enabled ? "Enabled" : "Disabled"}
                    </Label>
                    <Switch
                      id={`category-${category.serverId}`}
                      checked={category.enabled}
                      disabled={immutable}
                      onCheckedChange={(enabled) =>
                        onChange(category.serverId, { enabled })
                      }
                    />
                  </div>
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
                  <div>
                    <Label htmlFor={`description-${category.serverId}`}>
                      Description
                    </Label>
                    <Textarea
                      id={`description-${category.serverId}`}
                      value={category.description}
                      disabled={immutable}
                      maxLength={300}
                      className="mt-2 min-h-20"
                      onChange={(event) =>
                        onChange(category.serverId, {
                          description: event.target.value,
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor={`color-${category.serverId}`}>Color</Label>
                    <Select
                      value={category.colorToken}
                      disabled={immutable}
                      onValueChange={(value: CategoryColorToken) =>
                        onChange(category.serverId, { colorToken: value })
                      }
                    >
                      <SelectTrigger
                        id={`color-${category.serverId}`}
                        className="mt-2 w-full"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {colorOptions.map((color) => (
                          <SelectItem key={color.value} value={color.value}>
                            <span
                              aria-hidden="true"
                              className={cn("size-2.5 rounded-full", color.dot)}
                            />
                            {color.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function WorkspacePreviewStep({ draft }: { draft: OnboardingDraft }) {
  return (
    <div>
      <StepHeading
        eyebrow="Configured preview"
        title="Enter the shell before deciding whether to activate it."
        description="The configuration is saved. This preview intentionally omits mention rows while monitoring is off; it does not claim that historical customer data exists or fabricate conversations."
      />
      <div className="border-border mt-6 overflow-hidden rounded-lg border">
        <div className="border-border flex items-center gap-1 border-b px-4 py-2">
          <span className="text-foreground border-primary inline-flex h-9 items-center gap-2 border-b-2 px-2 text-sm font-medium">
            <AtIcon aria-hidden="true" className="size-4" />
            Mentions
          </span>
          <span className="text-muted-foreground inline-flex h-9 items-center gap-2 px-2 text-sm">
            <KeyIcon aria-hidden="true" className="size-4" />
            Keywords
          </span>
        </div>
        <div className="px-5 py-6 sm:px-7">
          <div className="border-border border-b pb-4">
            <p className="text-primary text-xs font-semibold tracking-wide uppercase">
              {draft.workspaceName}
            </p>
            <h2 className="text-foreground mt-1 text-xl font-semibold">
              Mentions
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {draft.keywords.length} configured keyword
              {draft.keywords.length === 1 ? "" : "s"}; collection inactive.
            </p>
          </div>
          <div className="grid min-h-56 place-items-center py-8 text-center">
            <div className="max-w-md">
              <span className="border-border bg-muted text-muted-foreground mx-auto grid size-10 place-items-center rounded-lg border">
                <AtIcon aria-hidden="true" className="size-5" />
              </span>
              <h3 className="text-foreground mt-4 text-sm font-semibold">
                No live mentions in this preview
              </h3>
              <p className="text-muted-foreground mt-1.5 text-sm leading-6">
                Astreex does not insert sample conversations. An active
                subscription is required before collection can begin.
              </p>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        {draft.keywords.map((keyword) => (
          <span
            key={keyword.clientId}
            className="border-border bg-muted text-muted-foreground inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs"
          >
            <KeyIcon aria-hidden="true" className="size-3.5" />
            {keyword.phrase}
          </span>
        ))}
      </div>
    </div>
  )
}

function PlanStep({
  accessBillingSetupRequired,
  checkoutError,
  checkoutPending,
  draft,
  onCheckout,
  onPlanChange,
  pollMessage,
}: {
  accessBillingSetupRequired: boolean
  checkoutError: string | null
  checkoutPending: boolean
  draft: OnboardingDraft
  onCheckout: () => void
  onPlanChange: (planId: PlanId) => void
  pollMessage: string | null
}) {
  const selectedPlan = draft.selectedPlan
    ? planById.get(draft.selectedPlan)
    : null
  const keywordCount = draft.keywords.length
  const selectedPlanFits = Boolean(
    selectedPlan && keywordCount <= selectedPlan.keywordLimit,
  )
  const checkoutPlan = draft.checkout
    ? planById.get(draft.checkout.planId)
    : null

  return (
    <div>
      <StepHeading
        eyebrow="Activation"
        title="Choose the plan that fits your saved configuration."
        description="All plans include the complete product. Limits change with monitoring volume and keyword count; checkout is the final step and does not itself prove that access is active."
      />

      {accessBillingSetupRequired && (
        <StatusState
          variant="warning"
          className="mt-6"
          title="Creem checkout is not configured"
          description="You can review plans and keep this draft, but checkout cannot start until the deployment owner configures billing."
          icon={<WarningCircleIcon />}
        />
      )}

      <div
        role="radiogroup"
        aria-label="Subscription plan"
        className="mt-6 grid gap-3 sm:grid-cols-3"
      >
        {PLAN_DEFINITIONS.map((plan) => {
          const fits = keywordCount <= plan.keywordLimit
          const checked = selectedPlan?.id === plan.id
          return (
            <label
              key={plan.id}
              className={cn(
                "border-border has-[:focus-visible]:ring-ring relative rounded-lg border p-4 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-offset-2",
                fits ? "cursor-pointer" : "cursor-not-allowed opacity-55",
                checked && fits && "border-primary bg-primary/5",
              )}
            >
              <input
                type="radio"
                name="plan"
                value={plan.id}
                checked={checked}
                disabled={!fits}
                onChange={() => onPlanChange(plan.id)}
                className="sr-only"
              />
              <span className="flex items-start justify-between gap-3">
                <span>
                  <span className="text-foreground block text-sm font-semibold">
                    {plan.name}
                  </span>
                  <span className="text-muted-foreground mt-1 block text-xs">
                    {plan.keywordLimit} keywords ·{" "}
                    {plan.monthlyMentionLimit.toLocaleString()} mentions
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    "border-input grid size-4 shrink-0 place-items-center rounded-full border",
                    checked &&
                      fits &&
                      "border-primary bg-primary text-primary-foreground",
                  )}
                >
                  {checked && fits && (
                    <CheckIcon className="size-2.5" weight="bold" />
                  )}
                </span>
              </span>
              <span className="text-foreground mt-5 block text-2xl font-semibold tabular-nums">
                ${plan.priceUsd}
                <span className="text-muted-foreground text-xs font-normal">
                  {" "}
                  / month
                </span>
              </span>
              <span
                className={cn(
                  "mt-3 block text-xs",
                  fits ? "text-muted-foreground" : "text-destructive",
                )}
              >
                {fits
                  ? `${keywordCount} of ${plan.keywordLimit} keyword slots used`
                  : `${keywordCount - plan.keywordLimit} too many keywords for this plan`}
              </span>
            </label>
          )
        })}
      </div>

      {selectedPlan && (
        <div className="border-border mt-5 flex flex-col gap-3 border-y py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p
              className={cn(
                "text-sm font-semibold",
                selectedPlanFits ? "text-foreground" : "text-destructive",
              )}
            >
              {selectedPlan.name}{" "}
              {selectedPlanFits ? "fits this draft" : "does not fit this draft"}
            </p>
            <p className="text-muted-foreground mt-1 text-xs leading-5">
              {keywordCount} configured of {selectedPlan.keywordLimit} allowed
              keywords. Monitoring remains inactive until Convex reports an
              active subscription.
            </p>
          </div>
          <span className="text-muted-foreground text-xs tabular-nums">
            {selectedPlanFits
              ? `${selectedPlan.keywordLimit - keywordCount} slot${selectedPlan.keywordLimit - keywordCount === 1 ? "" : "s"} remaining`
              : `${keywordCount - selectedPlan.keywordLimit} keyword${keywordCount - selectedPlan.keywordLimit === 1 ? "" : "s"} over the limit`}
          </span>
        </div>
      )}

      {draft.checkout && checkoutPlan && (
        <StatusState
          className="mt-5"
          variant="loading"
          title={`Checkout started for ${checkoutPlan.name}`}
          description={
            <>
              The saved checkout is still pending. Astreex checks authoritative
              subscription status before opening access. Returning from Creem or
              reopening this page never marks the account active by itself.
              <span className="mt-1 block text-xs">
                Started {new Date(draft.checkout.startedAt).toLocaleString()} ·
                Provider status: {draft.checkout.status}
              </span>
              {pollMessage && (
                <span className="mt-1 block text-xs">{pollMessage}</span>
              )}
            </>
          }
        />
      )}

      {checkoutError && (
        <StatusState
          className="mt-5"
          variant="error"
          title="Checkout could not continue"
          description={checkoutError}
        />
      )}

      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button
          size="lg"
          onClick={onCheckout}
          disabled={
            !selectedPlan ||
            !selectedPlanFits ||
            accessBillingSetupRequired ||
            checkoutPending
          }
        >
          {checkoutPending ? (
            <CircleNotchIcon aria-hidden="true" className="animate-spin" />
          ) : (
            <CreditCardIcon aria-hidden="true" />
          )}
          {draft.checkout?.url
            ? "Continue saved checkout"
            : "Continue to secure checkout"}
        </Button>
        <p className="text-muted-foreground text-xs leading-5">
          Checkout is handled by Creem. Activation is accepted only from the
          subscription status returned by Convex.
        </p>
      </div>
    </div>
  )
}

export function OnboardingFlow() {
  const { access, billing, workspace } = useProductContext()
  const router = useRouter()
  const convex = useConvex()
  const storageKey = draftStorageKey(workspace.workspace.id)
  const [draft, setDraft] = useState<OnboardingDraft>(() =>
    createOnboardingDraft(workspace.workspace.name),
  )
  const [draftOrigin, setDraftOrigin] = useState<"loading" | "new" | "stored">(
    "loading",
  )
  const [stepError, setStepError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savingConfiguration, setSavingConfiguration] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [checkoutPending, setCheckoutPending] = useState(false)
  const [pollMessage, setPollMessage] = useState<string | null>(null)
  const serverHydrated = useRef(false)

  const keywordValue = useQuery(onboardingConvex.keywords.list, {})
  const categoryValue = useQuery(onboardingConvex.categories.list, {})
  const saveConfiguration = useMutation(onboardingConvex.configuration.save)
  const createCheckout = useAction(onboardingConvex.billing.createCheckout)

  const parsedKeywords = useMemo(
    () =>
      keywordValue === undefined
        ? null
        : keywordListResultSchema.safeParse(keywordValue),
    [keywordValue],
  )
  const parsedCategories = useMemo(
    () =>
      categoryValue === undefined
        ? null
        : categoryListResultSchema.safeParse(categoryValue),
    [categoryValue],
  )

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const stored = readDraftFromStorage(storageKey)
      if (stored) {
        setDraft(stored)
        setDraftOrigin("stored")
        return
      }

      setDraft(createOnboardingDraft(workspace.workspace.name))
      setDraftOrigin("new")
    }, 0)

    return () => window.clearTimeout(timeout)
  }, [storageKey, workspace.workspace.name])

  useEffect(() => {
    if (draftOrigin === "loading") {
      return
    }
    writeDraftToStorage(storageKey, draft)
  }, [draft, draftOrigin, storageKey])

  useEffect(() => {
    if (
      serverHydrated.current ||
      draftOrigin === "loading" ||
      !parsedKeywords?.success ||
      !parsedCategories?.success
    ) {
      return
    }

    const currentKeywords = parsedKeywords.data.filter(
      (keyword) => keyword.status !== "deleted",
    )
    const categoryDrafts = parsedCategories.data.map(categoryDraftFromResult)
    const timeout = window.setTimeout(() => {
      serverHydrated.current = true
      setDraft((current) => {
        const shouldResumeSavedConfiguration =
          draftOrigin === "new" && currentKeywords.length > 0
        const keywords = shouldResumeSavedConfiguration
          ? currentKeywords.map(keywordDraftFromResult)
          : current.keywords
        const keywordCount = keywords.length
        const serverOther = categoryDrafts.find(
          (category) => category.systemKey === "other",
        )
        const categories = (
          current.categories.length > 0 ? current.categories : categoryDrafts
        ).map((category) =>
          category.systemKey === "other" && serverOther
            ? serverOther
            : category,
        )

        return {
          ...current,
          categories,
          ...(shouldResumeSavedConfiguration
            ? {
                configurationSavedAt: Date.now(),
                keywords,
                selectedPlan: smallestPlanFor(keywordCount),
                step: 6 as const,
              }
            : {}),
        }
      })
    }, 0)

    return () => window.clearTimeout(timeout)
  }, [draftOrigin, parsedCategories, parsedKeywords])

  useEffect(() => {
    if (billing.subscription?.entitlementStatus === "active") {
      router.replace("/app/mentions")
    }
  }, [billing.subscription?.entitlementStatus, router])

  useEffect(() => {
    if (
      !draft.checkout ||
      billing.subscription?.entitlementStatus === "active"
    ) {
      return
    }

    let mounted = true
    let checking = false

    const checkSubscription = async () => {
      if (checking) {
        return
      }
      checking = true
      try {
        const value = await convex.query(
          onboardingConvex.billing.getOverview,
          {},
        )
        const parsed = billingOverviewResultSchema.safeParse(value)
        if (!mounted) {
          return
        }
        if (!parsed.success) {
          setPollMessage(
            "The latest billing response could not be verified safely.",
          )
          return
        }
        if (parsed.data.subscription?.entitlementStatus === "active") {
          router.replace("/app/mentions")
          return
        }
        setPollMessage("Latest check: subscription is not active yet.")
      } catch {
        if (mounted) {
          setPollMessage(
            "The latest subscription check failed; Astreex will retry.",
          )
        }
      } finally {
        checking = false
      }
    }

    void checkSubscription()
    const interval = window.setInterval(() => {
      void checkSubscription()
    }, 4_000)

    return () => {
      mounted = false
      window.clearInterval(interval)
    }
  }, [billing.subscription?.entitlementStatus, convex, draft.checkout, router])

  const changeDraft = useCallback(
    (updater: (current: OnboardingDraft) => OnboardingDraft) => {
      setStepError(null)
      setSaveError(null)
      setCheckoutError(null)
      setDraft(updater)
    },
    [],
  )

  const dirtyDraft = useCallback(
    (updater: (current: OnboardingDraft) => OnboardingDraft) => {
      changeDraft((current) => {
        const next = updater(current)
        return { ...next, configurationSavedAt: undefined }
      })
    },
    [changeDraft],
  )

  const addKeyword = useCallback(
    (kind: OnboardingKeywordDraft["kind"], phrase: string): string | null => {
      const trimmed = phrase.trim().replace(/\s+/g, " ")
      if (!trimmed) {
        return "Enter a keyword before adding it."
      }
      if (draft.keywords.length >= MAX_DRAFT_KEYWORDS) {
        return `A draft can contain at most ${MAX_DRAFT_KEYWORDS} keywords.`
      }
      const normalized = normalizeKeywordPhrase(trimmed)
      if (
        draft.keywords.some(
          (keyword) => normalizeKeywordPhrase(keyword.phrase) === normalized,
        )
      ) {
        return "That keyword is already in this configuration."
      }

      dirtyDraft((current) => ({
        ...current,
        keywords: [
          ...current.keywords,
          {
            clientId: createClientId(),
            kind,
            phrase: trimmed,
            platforms: [],
          },
        ],
      }))
      return null
    },
    [dirtyDraft, draft.keywords],
  )

  const removeKeywordFromDraft = useCallback(
    (clientId: string) => {
      dirtyDraft((current) => ({
        ...current,
        keywords: current.keywords.filter(
          (keyword) => keyword.clientId !== clientId,
        ),
      }))
    },
    [dirtyDraft],
  )

  const togglePlatform = useCallback(
    (clientId: string, platform: OnboardingPlatform, checked: boolean) => {
      dirtyDraft((current) => ({
        ...current,
        keywords: current.keywords.map((keyword) => {
          if (keyword.clientId !== clientId) {
            return keyword
          }
          if (
            !checked &&
            keyword.platforms.length === 1 &&
            keyword.platforms.includes(platform)
          ) {
            return keyword
          }

          return {
            ...keyword,
            platforms: checked
              ? Array.from(new Set([...keyword.platforms, platform]))
              : keyword.platforms.filter((value) => value !== platform),
          }
        }),
      }))
    },
    [dirtyDraft],
  )

  const updateCategoryDraft = useCallback(
    (
      serverId: string,
      patch: Partial<
        Pick<OnboardingCategoryDraft, "colorToken" | "description" | "enabled">
      >,
    ) => {
      dirtyDraft((current) => ({
        ...current,
        categories: current.categories.map((category) =>
          category.serverId === serverId && category.systemKey !== "other"
            ? { ...category, ...patch }
            : category,
        ),
      }))
    },
    [dirtyDraft],
  )

  const persistConfiguration = useCallback(async (): Promise<boolean> => {
    const categoryValidation = validateStep(draft, 5)
    const platformValidation = validateStep(draft, 4)
    const ownValidation = validateStep(draft, 2)
    const otherValidation = validateStep(draft, 3)
    const validation =
      ownValidation ??
      otherValidation ??
      platformValidation ??
      categoryValidation

    if (validation) {
      setStepError(validation)
      return false
    }
    if (!parsedKeywords?.success || !parsedCategories?.success) {
      setSaveError(
        "The current keyword or category data could not be verified. Reload the account before saving.",
      )
      return false
    }

    setSavingConfiguration(true)
    setSaveError(null)

    try {
      const result = onboardingConfigurationResultSchema.safeParse(
        await saveConfiguration({
          categories: draft.categories.map((category) => ({
            categoryId: category.serverId,
            colorToken: category.colorToken,
            description: category.description.trim(),
            enabled: category.enabled,
          })),
          keywords: draft.keywords.map((keyword) => ({
            phrase: keyword.phrase.trim(),
            platforms: keyword.platforms,
          })),
          workspaceName: draft.workspaceName.trim(),
        }),
      )
      if (
        !result.success ||
        result.data.keywordCount !== draft.keywords.length
      ) {
        throw new Error("Onboarding configuration result is invalid")
      }

      const savedAt = Date.now()
      setDraft((current) => ({
        ...current,
        configurationSavedAt: savedAt,
        selectedPlan:
          current.selectedPlan &&
          current.keywords.length <=
            (planById.get(current.selectedPlan)?.keywordLimit ?? 0)
            ? current.selectedPlan
            : smallestPlanFor(current.keywords.length),
        step: 6,
      }))
      return true
    } catch {
      setSaveError(
        "Astreex could not save the complete configuration. No activation was attempted. Review the authenticated Convex connection and try again.",
      )
      return false
    } finally {
      setSavingConfiguration(false)
    }
  }, [draft, parsedCategories, parsedKeywords, saveConfiguration])

  const goForward = useCallback(async () => {
    const validation = validateStep(draft, draft.step)
    if (validation) {
      setStepError(validation)
      return
    }

    if (draft.step === 5) {
      await persistConfiguration()
      return
    }

    if (draft.step < ONBOARDING_STEP_COUNT) {
      changeDraft((current) => ({
        ...current,
        selectedPlan:
          current.step === 6 && !current.selectedPlan
            ? smallestPlanFor(current.keywords.length)
            : current.selectedPlan,
        step: (current.step + 1) as OnboardingStep,
      }))
    }
  }, [changeDraft, draft, persistConfiguration])

  const goBack = useCallback(() => {
    if (draft.step <= 1) {
      return
    }
    changeDraft((current) => ({
      ...current,
      step: (current.step - 1) as OnboardingStep,
    }))
  }, [changeDraft, draft.step])

  const choosePlan = useCallback(
    (planId: PlanId) => {
      changeDraft((current) => ({
        ...current,
        checkout:
          current.checkout?.planId === planId ? current.checkout : undefined,
        selectedPlan: planId,
      }))
    },
    [changeDraft],
  )

  const beginCheckout = useCallback(async () => {
    const validation = validateStep(draft, 7)
    if (validation) {
      setStepError(validation)
      return
    }
    if (!draft.selectedPlan) {
      return
    }
    if (access.billingSetupRequired) {
      setCheckoutError(
        "Billing is not configured for this deployment. The draft remains saved and monitoring is still inactive.",
      )
      return
    }

    setCheckoutPending(true)
    setCheckoutError(null)

    const pending =
      draft.checkout?.planId === draft.selectedPlan
        ? draft.checkout
        : {
            idempotencyKey: createCheckoutKey(
              workspace.workspace.id,
              draft.selectedPlan,
            ),
            planId: draft.selectedPlan,
            startedAt: Date.now(),
            status: "requested",
          }
    const pendingDraft: OnboardingDraft = { ...draft, checkout: pending }
    setDraft(pendingDraft)
    writeDraftToStorage(storageKey, pendingDraft)

    try {
      if (pending.url) {
        window.location.assign(pending.url)
        return
      }

      const value = await createCheckout({
        idempotencyKey: pending.idempotencyKey,
        planId: pending.planId,
      })
      const result = checkoutResultSchema.safeParse(value)
      if (!result.success) {
        throw new Error("Unexpected checkout result")
      }
      if (result.data.state === "provider_unconfigured") {
        const providerDraft: OnboardingDraft = {
          ...pendingDraft,
          checkout: { ...pending, status: "provider_unconfigured" },
        }
        setDraft(providerDraft)
        writeDraftToStorage(storageKey, providerDraft)
        setCheckoutError(
          "Creem checkout is not configured. The draft and checkout intent were preserved, but no billing page was opened.",
        )
        return
      }

      const redirectDraft: OnboardingDraft = {
        ...pendingDraft,
        checkout: {
          ...pending,
          checkoutId: result.data.checkoutId,
          status: result.data.status,
          url: result.data.url,
        },
      }
      setDraft(redirectDraft)
      writeDraftToStorage(storageKey, redirectDraft)
      window.location.assign(result.data.url)
    } catch {
      setCheckoutError(
        "Checkout could not be created. The saved configuration and checkout intent remain available so you can retry without assuming access is active.",
      )
    } finally {
      setCheckoutPending(false)
    }
  }, [
    access.billingSetupRequired,
    createCheckout,
    draft,
    storageKey,
    workspace.workspace.id,
  ])

  if (draftOrigin === "loading") {
    return (
      <div
        className="text-muted-foreground flex min-h-[50vh] items-center justify-center gap-2 text-sm"
        role="status"
      >
        <CircleNotchIcon aria-hidden="true" className="size-4 animate-spin" />
        Restoring your setup progress…
      </div>
    )
  }

  const currentStep = steps[draft.step - 1] ?? steps[0]
  const progress = (draft.step / ONBOARDING_STEP_COUNT) * 100
  const stepContent = (() => {
    switch (draft.step) {
      case 1:
        return <WelcomeStep workspaceName={draft.workspaceName} />
      case 2:
        return (
          <OwnKeywordsStep
            draft={draft}
            onAdd={addKeyword}
            onRemove={removeKeywordFromDraft}
            onWorkspaceNameChange={(workspaceName) =>
              dirtyDraft((current) => ({ ...current, workspaceName }))
            }
          />
        )
      case 3:
        return (
          <OtherKeywordsStep
            draft={draft}
            onAdd={addKeyword}
            onRemove={removeKeywordFromDraft}
          />
        )
      case 4:
        return (
          <PlatformsStep keywords={draft.keywords} onToggle={togglePlatform} />
        )
      case 5:
        return (
          <CategoriesStep
            categories={draft.categories}
            loading={categoryValue === undefined}
            onChange={updateCategoryDraft}
          />
        )
      case 6:
        return <WorkspacePreviewStep draft={draft} />
      case 7:
        return (
          <PlanStep
            accessBillingSetupRequired={access.billingSetupRequired}
            checkoutError={checkoutError}
            checkoutPending={checkoutPending}
            draft={draft}
            onCheckout={beginCheckout}
            onPlanChange={choosePlan}
            pollMessage={pollMessage}
          />
        )
    }
  })()

  return (
    <section
      className="mx-auto max-w-5xl"
      aria-labelledby="onboarding-current-step"
    >
      <div className="border-border mb-7 border-b pb-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-muted-foreground text-xs font-medium">
              Step {draft.step} of {ONBOARDING_STEP_COUNT}
            </p>
            <p
              id="onboarding-current-step"
              className="text-foreground mt-0.5 text-sm font-semibold"
            >
              {currentStep.title}
            </p>
          </div>
          <p className="text-muted-foreground text-right text-xs">
            {draftOrigin === "stored" && draft.step > 1
              ? "Progress restored on this device"
              : "Draft saves on this device"}
          </p>
        </div>
        <Progress
          value={progress}
          aria-label={`Onboarding progress: step ${draft.step} of ${ONBOARDING_STEP_COUNT}`}
          className="mt-4 h-1.5"
        />
        <ol className="mt-3 hidden grid-cols-7 gap-2 md:grid">
          {steps.map((step, index) => {
            const number = index + 1
            return (
              <li
                key={step.title}
                className={cn(
                  "text-xs",
                  number === draft.step
                    ? "text-foreground font-medium"
                    : number < draft.step
                      ? "text-primary"
                      : "text-muted-foreground",
                )}
              >
                {number < draft.step && (
                  <CheckCircleIcon
                    aria-hidden="true"
                    className="mr-1 inline size-3.5"
                    weight="fill"
                  />
                )}
                {step.label}
              </li>
            )
          })}
        </ol>
      </div>

      {stepContent}

      {(stepError ||
        saveError ||
        parsedKeywords?.success === false ||
        parsedCategories?.success === false) && (
        <StatusState
          className="mt-6"
          variant="error"
          title="This step needs attention"
          description={
            stepError ??
            saveError ??
            "The connected account returned configuration data this version of Astreex cannot safely edit. Reload before continuing."
          }
        />
      )}

      <div className="border-border mt-8 flex flex-col-reverse gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
        <Button
          variant="ghost"
          onClick={goBack}
          disabled={draft.step === 1 || savingConfiguration || checkoutPending}
        >
          <ArrowLeftIcon aria-hidden="true" />
          Back
        </Button>
        {draft.step < 7 && (
          <Button
            onClick={() => void goForward()}
            disabled={savingConfiguration}
          >
            {savingConfiguration ? (
              <CircleNotchIcon aria-hidden="true" className="animate-spin" />
            ) : draft.step === 5 ? (
              <ShieldCheckIcon aria-hidden="true" />
            ) : (
              <ArrowRightIcon aria-hidden="true" />
            )}
            {draft.step === 1
              ? "Start setup"
              : draft.step === 5
                ? "Save configuration"
                : draft.step === 6
                  ? "Choose a plan"
                  : "Continue"}
          </Button>
        )}
      </div>
    </section>
  )
}
