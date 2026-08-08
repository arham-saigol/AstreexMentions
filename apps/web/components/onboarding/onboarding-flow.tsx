"use client"

import { api } from "@astreex/backend/api"
import { PLAN_DEFINITIONS } from "@astreex/domain"
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CircleNotchIcon,
  KeyIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react"
import { Button } from "@astreex/ui/components/button"
import { Checkbox } from "@astreex/ui/components/checkbox"
import { Input } from "@astreex/ui/components/input"
import { Label } from "@astreex/ui/components/label"
import { Progress } from "@astreex/ui/components/progress"
import { Textarea } from "@astreex/ui/components/textarea"
import { cn } from "@astreex/ui/lib/utils"
import { useAction, useMutation } from "convex/react"
import { useRouter } from "next/navigation"
import { useEffect, useState, type FormEvent } from "react"

import { useProductContext } from "@/components/product/product-context"
import {
  canReuseOnboardingCheckout,
  clearOnboardingDraftStorage,
  createOnboardingDraft,
  draftStorageKey,
  MAX_DRAFT_KEYWORDS,
  normalizeKeywordPhrase,
  onboardingDraftSchema,
  type OnboardingDraft,
  type OnboardingKeywordDraft,
} from "@/lib/onboarding-draft"

type Platform = OnboardingKeywordDraft["platforms"][number]

const platforms = [
  { label: "X", value: "x" },
  { label: "Reddit", value: "reddit" },
  { label: "Hacker News", value: "hacker_news" },
] as const satisfies readonly { label: string; value: Platform }[]

function clientId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `keyword-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function checkoutKey(workspaceId: string, plan: string): string {
  return `web:${workspaceId}:${plan}:${clientId()}`.slice(0, 200)
}

function readDraft(key: string, workspaceName: string): OnboardingDraft {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return createOnboardingDraft(workspaceName)
    const parsed = onboardingDraftSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : createOnboardingDraft(workspaceName)
  } catch {
    return createOnboardingDraft(workspaceName)
  }
}

function persistDraft(key: string, draft: OnboardingDraft) {
  try {
    window.localStorage.setItem(key, JSON.stringify(draft))
  } catch {
    // The current in-memory form remains usable without local storage.
  }
}

function KeywordEditor({
  keyword,
  onChange,
  onRemove,
}: {
  keyword: OnboardingKeywordDraft
  onChange: (keyword: OnboardingKeywordDraft) => void
  onRemove: () => void
}) {
  return (
    <article
      className={cn(
        "border-border rounded-lg border p-4",
        keyword.selected ? "bg-card" : "bg-muted/30 opacity-75",
      )}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          aria-label={`Select ${keyword.phrase || "keyword"}`}
          checked={keyword.selected}
          onCheckedChange={(checked) =>
            onChange({ ...keyword, selected: checked === true })
          }
          className="mt-2"
        />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <Label htmlFor={`${keyword.clientId}-phrase`}>Keyword phrase</Label>
            <Input
              id={`${keyword.clientId}-phrase`}
              className="mt-1.5"
              value={keyword.phrase}
              maxLength={160}
              onChange={(event) =>
                onChange({ ...keyword, phrase: event.target.value })
              }
              placeholder="Brand, product, competitor, or customer problem"
            />
          </div>
          <div>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor={`${keyword.clientId}-description`}>
                Relevance description{" "}
                <span className="font-normal">(optional)</span>
              </Label>
              <span className="text-muted-foreground text-xs tabular-nums">
                {keyword.description.length}/160
              </span>
            </div>
            <Textarea
              id={`${keyword.clientId}-description`}
              className="mt-1.5 min-h-20"
              value={keyword.description}
              maxLength={160}
              onChange={(event) =>
                onChange({ ...keyword, description: event.target.value })
              }
              placeholder="Why this phrase matters for categorization"
            />
          </div>
          <fieldset>
            <legend className="text-sm font-medium">Platforms</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {platforms.map((platform) => {
                const checked = keyword.platforms.includes(platform.value)
                return (
                  <label
                    key={platform.value}
                    className={cn(
                      "border-border inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm",
                      checked && "border-primary bg-primary/5",
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(value) => {
                        const next =
                          value === true
                            ? [
                                ...new Set([
                                  ...keyword.platforms,
                                  platform.value,
                                ]),
                              ]
                            : keyword.platforms.filter(
                                (candidate) => candidate !== platform.value,
                              )
                        onChange({ ...keyword, platforms: next })
                      }}
                    />
                    {platform.label}
                  </label>
                )
              })}
            </div>
          </fieldset>
        </div>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          onClick={onRemove}
          aria-label={`Remove ${keyword.phrase || "keyword"}`}
        >
          <TrashIcon aria-hidden="true" />
        </Button>
      </div>
    </article>
  )
}

export function OnboardingFlow() {
  const router = useRouter()
  const { workspace } = useProductContext()
  const storageKey = draftStorageKey(workspace.workspace.id)
  const [draft, setDraft] = useState<OnboardingDraft>(() =>
    createOnboardingDraft(workspace.workspace.name),
  )
  const [hydrated, setHydrated] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const researchCompany = useAction(api.onboardingDiscovery.researchCompany)
  const saveConfiguration = useMutation(
    api.onboarding.saveOnboardingConfiguration,
  )
  const createCheckout = useAction(api.billing.customer.createCheckout)

  useEffect(() => {
    const hydrateTimer = window.setTimeout(() => {
      setDraft(readDraft(storageKey, workspace.workspace.name))
      setHydrated(true)
    }, 0)
    return () => window.clearTimeout(hydrateTimer)
  }, [storageKey, workspace.workspace.name])
  useEffect(() => {
    if (hydrated) persistDraft(storageKey, draft)
  }, [draft, hydrated, storageKey])

  const selectedKeywords = draft.keywords.filter((keyword) => keyword.selected)
  const duplicate = (() => {
    const seen = new Set<string>()
    for (const keyword of selectedKeywords) {
      const normalized = normalizeKeywordPhrase(keyword.phrase)
      if (seen.has(normalized)) return keyword.phrase.trim()
      seen.add(normalized)
    }
    return null
  })()

  const updateKeyword = (index: number, keyword: OnboardingKeywordDraft) => {
    setDraft((current) => ({
      ...current,
      keywords: current.keywords.map((row, rowIndex) =>
        rowIndex === index ? keyword : row,
      ),
    }))
    setError(null)
  }

  const startResearch = async (event: FormEvent) => {
    event.preventDefault()
    if (!draft.websiteUrl.trim() && !draft.manualDescription.trim()) {
      setError("Enter a company website or a short company description.")
      return
    }
    setPending(true)
    setError(null)
    try {
      const result = await researchCompany({
        ...(draft.manualDescription.trim()
          ? { manualDescription: draft.manualDescription }
          : {}),
        ...(draft.websiteUrl.trim() ? { websiteUrl: draft.websiteUrl } : {}),
      })
      if (result.state === "completed") {
        setDraft((current) => ({
          ...current,
          companyDescription: result.companyDescription,
          keywords: result.suggestions.map((suggestion) => ({
            ...suggestion,
            clientId: clientId(),
            selected: true,
          })),
          step: 2,
        }))
      } else if (result.state === "in_progress") {
        setError("Research is already running. Wait a moment, then retry.")
      } else if (result.state === "rate_limited") {
        setError(
          "Research was requested too often. Try again later or add a keyword manually.",
        )
      } else {
        setError(result.message)
      }
    } catch {
      setError(
        "Company research failed. Your entries are still here; retry or continue manually.",
      )
    } finally {
      setPending(false)
    }
  }

  const continueToPlans = () => {
    if (!draft.companyDescription.trim()) {
      setError("Review or enter a concise company description.")
      return
    }
    if (selectedKeywords.length === 0) {
      setError("Select or add at least one keyword.")
      return
    }
    if (selectedKeywords.some((keyword) => !keyword.phrase.trim())) {
      setError("Every selected keyword needs a phrase.")
      return
    }
    if (selectedKeywords.some((keyword) => keyword.platforms.length === 0)) {
      setError("Every selected keyword needs at least one platform.")
      return
    }
    if (duplicate) {
      setError(`“${duplicate}” is selected more than once.`)
      return
    }
    setError(null)
    setDraft((current) => ({ ...current, step: 3 }))
  }

  const activate = async () => {
    const plan = draft.selectedPlan
    if (!plan) {
      setError("Choose the free evaluation or a paid plan.")
      return
    }
    setPending(true)
    setError(null)
    try {
      const result = await saveConfiguration({
        accessPath: plan,
        companyDescription: draft.companyDescription.trim(),
        keywords: selectedKeywords.map((keyword, selectionOrder) => ({
          brandCandidate: keyword.brandCandidate,
          ...(keyword.description.trim()
            ? { description: keyword.description.trim() }
            : {}),
          phrase: keyword.phrase.trim().replace(/\s+/g, " "),
          platforms: keyword.platforms,
          selectionOrder,
        })),
        workspaceName: draft.workspaceName || workspace.workspace.name,
      })
      const paidPlan =
        plan === "free"
          ? null
          : (PLAN_DEFINITIONS.find((definition) => definition.id === plan) ??
            null)
      const completionCounts = paidPlan
        ? {
            activeCount: Math.min(
              selectedKeywords.length,
              paidPlan.keywordLimit,
            ),
            pausedCount: Math.max(
              0,
              selectedKeywords.length - paidPlan.keywordLimit,
            ),
          }
        : {
            activeCount: result.activeCount,
            pausedCount: result.pausedCount,
          }
      try {
        window.sessionStorage.setItem(
          "astreex:onboarding-result",
          JSON.stringify({
            ...completionCounts,
            paid: plan !== "free",
          }),
        )
      } catch {
        // Navigation must not depend on storage availability.
      }
      if (plan === "free") {
        clearOnboardingDraftStorage(window.localStorage, workspace.workspace.id)
        router.push("/app/mentions")
        return
      }

      const existing = draft.checkout
      const idempotencyKey =
        existing?.planId === plan &&
        canReuseOnboardingCheckout(existing, Date.now())
          ? existing.idempotencyKey
          : checkoutKey(workspace.workspace.id, plan)
      const checkout = await createCheckout({ idempotencyKey, planId: plan })
      if (checkout.state === "provider_unconfigured") {
        setError(
          "Paid checkout is temporarily unavailable. Your keyword configuration was saved.",
        )
        return
      }
      setDraft((current) => ({
        ...current,
        checkout: {
          checkoutId: checkout.checkoutId,
          idempotencyKey,
          planId: plan,
          startedAt: Date.now(),
          status: checkout.status,
          url: checkout.url,
        },
      }))
      window.location.assign(checkout.url)
    } catch (activationError) {
      setError(
        activationError instanceof Error
          ? activationError.message
          : "Onboarding could not be completed.",
      )
    } finally {
      setPending(false)
    }
  }

  if (!hydrated) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <CircleNotchIcon
          className="size-6 animate-spin"
          aria-label="Loading onboarding"
        />
      </div>
    )
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-5 py-10 sm:px-8">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <p className="text-muted-foreground text-xs font-semibold tracking-[0.1em] uppercase">
            Setup {draft.step} of 3
          </p>
          <h1 className="font-display mt-2 text-3xl font-medium tracking-[-0.02em]">
            {draft.step === 1
              ? "Tell us about your company"
              : draft.step === 2
                ? "Choose what to monitor"
                : "Start monitoring"}
          </h1>
        </div>
        <Progress
          value={(draft.step / 3) * 100}
          className="w-32"
          aria-label={`Onboarding step ${draft.step} of 3`}
        />
      </div>

      {draft.step === 1 && (
        <form
          onSubmit={startResearch}
          className="border-border bg-card rounded-xl border p-6 sm:p-8"
        >
          <p className="text-muted-foreground mb-6 max-w-2xl text-sm leading-6">
            Astreex reads your public website, checks a bounded set of web
            results, and suggests editable monitor keywords.
          </p>
          <div>
            <Label htmlFor="company-website">Company website</Label>
            <Input
              id="company-website"
              type="url"
              value={draft.websiteUrl}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  websiteUrl: event.target.value,
                }))
              }
              placeholder="https://example.com"
              className="mt-2"
              autoFocus
            />
          </div>
          <div className="mt-5">
            <Label htmlFor="manual-description">
              Manual company description{" "}
              <span className="font-normal">(optional fallback)</span>
            </Label>
            <Textarea
              id="manual-description"
              value={draft.manualDescription}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  manualDescription: event.target.value,
                }))
              }
              maxLength={1_000}
              className="mt-2 min-h-28"
              placeholder="Use this if the website is private or unavailable."
            />
          </div>
          {error && (
            <p role="alert" className="text-destructive mt-4 text-sm">
              {error}
            </p>
          )}
          <div className="mt-6 flex flex-wrap gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? (
                <CircleNotchIcon className="animate-spin" />
              ) : (
                <MagnifyingGlassIcon />
              )}
              {pending ? "Researching company…" : "Research company"}
            </Button>
            {error && (
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    companyDescription:
                      current.manualDescription || current.companyDescription,
                    step: 2,
                  }))
                }
              >
                Add keywords manually
                <ArrowRightIcon />
              </Button>
            )}
          </div>
        </form>
      )}

      {draft.step === 2 && (
        <section>
          <div className="border-border bg-card rounded-xl border p-6">
            <Label htmlFor="company-context">Company context</Label>
            <Textarea
              id="company-context"
              value={draft.companyDescription}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  companyDescription: event.target.value,
                }))
              }
              maxLength={1_000}
              className="mt-2 min-h-28"
            />
            <p className="text-muted-foreground mt-2 text-xs">
              This reviewed context helps Astreex categorize mentions. It does
              not change provider queries.
            </p>
          </div>

          <div className="mt-6 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Keywords</h2>
              <p className="text-muted-foreground text-sm">
                {selectedKeywords.length} selected. You can save more than your
                active plan capacity.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={draft.keywords.length >= MAX_DRAFT_KEYWORDS}
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  keywords: [
                    ...current.keywords,
                    {
                      brandCandidate: false,
                      clientId: clientId(),
                      description: "",
                      phrase: "",
                      platforms: ["x", "reddit", "hacker_news"],
                      selected: true,
                    },
                  ],
                }))
              }
            >
              <PlusIcon /> Add custom keyword
            </Button>
          </div>
          <div className="mt-4 space-y-3">
            {draft.keywords.map((keyword, index) => (
              <KeywordEditor
                key={keyword.clientId}
                keyword={keyword}
                onChange={(next) => updateKeyword(index, next)}
                onRemove={() =>
                  setDraft((current) => ({
                    ...current,
                    keywords: current.keywords.filter(
                      (_, row) => row !== index,
                    ),
                  }))
                }
              />
            ))}
          </div>
          {draft.keywords.length === 0 && (
            <div className="border-border mt-4 rounded-lg border border-dashed p-8 text-center">
              <p className="text-sm font-medium">
                No suggestions were returned.
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                Add a custom keyword to continue.
              </p>
            </div>
          )}
          {error && (
            <p role="alert" className="text-destructive mt-4 text-sm">
              {error}
            </p>
          )}
          <div className="mt-6 flex justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDraft((current) => ({ ...current, step: 1 }))}
            >
              <ArrowLeftIcon /> Back
            </Button>
            <Button type="button" onClick={continueToPlans}>
              Choose access <ArrowRightIcon />
            </Button>
          </div>
        </section>
      )}

      {draft.step === 3 && (
        <section>
          <p className="text-muted-foreground mb-5 text-sm">
            Every option includes X, Reddit, Hacker News, categorization, custom
            categories, and digests. Capacity changes how many keywords collect
            at once.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <button
              type="button"
              onClick={() =>
                setDraft((current) => ({ ...current, selectedPlan: "free" }))
              }
              className={cn(
                "bg-card rounded-xl border p-6 text-left transition-colors",
                draft.selectedPlan === "free"
                  ? "border-primary ring-primary/20 ring-2"
                  : "border-border",
              )}
            >
              <p className="text-xs font-semibold tracking-[0.1em] uppercase">
                Free evaluation
              </p>
              <h2 className="mt-2 text-2xl font-semibold">
                First 100 mentions free
              </h2>
              <p className="text-muted-foreground mt-3 text-sm leading-6">
                Monitor one active keyword. Extra selected keywords stay saved
                and paused, ready to swap or upgrade.
              </p>
              <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold">
                <KeyIcon /> Start free
              </span>
            </button>
            {PLAN_DEFINITIONS.map((plan) => (
              <button
                key={plan.id}
                type="button"
                onClick={() =>
                  setDraft((current) => ({ ...current, selectedPlan: plan.id }))
                }
                className={cn(
                  "bg-card rounded-xl border p-6 text-left transition-colors",
                  draft.selectedPlan === plan.id
                    ? "border-primary ring-primary/20 ring-2"
                    : "border-border",
                )}
              >
                <p className="text-xs font-semibold tracking-[0.1em] uppercase">
                  {plan.name}
                </p>
                <h2 className="mt-2 text-2xl font-semibold">
                  ${plan.priceUsd} / month
                </h2>
                <p className="text-muted-foreground mt-3 text-sm">
                  {plan.keywordLimit} active keywords ·{" "}
                  {plan.monthlyMentionLimit.toLocaleString()} mentions monthly
                </p>
                <p className="text-muted-foreground mt-3 text-xs">
                  {selectedKeywords.length} selected;{" "}
                  {Math.max(0, selectedKeywords.length - plan.keywordLimit)}{" "}
                  would start paused.
                </p>
              </button>
            ))}
          </div>
          {error && (
            <p role="alert" className="text-destructive mt-4 text-sm">
              {error}
            </p>
          )}
          <div className="mt-6 flex justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDraft((current) => ({ ...current, step: 2 }))}
              disabled={pending}
            >
              <ArrowLeftIcon /> Back
            </Button>
            <Button
              type="button"
              onClick={() => void activate()}
              disabled={pending || !draft.selectedPlan}
            >
              {pending ? (
                <CircleNotchIcon className="animate-spin" />
              ) : (
                <ArrowRightIcon />
              )}
              {draft.selectedPlan === "free"
                ? "Start free"
                : "Continue to checkout"}
            </Button>
          </div>
        </section>
      )}
    </main>
  )
}
