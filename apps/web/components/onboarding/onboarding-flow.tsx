"use client"

import { api } from "@astreex/backend/api"
import { PLAN_DEFINITIONS } from "@astreex/domain"
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CaretDownIcon,
  CheckCircleIcon,
  CheckIcon,
  CircleNotchIcon,
  GlobeIcon,
  LightningIcon,
  LockKeyIcon,
  PlusIcon,
  ShieldCheckIcon,
  SparkleIcon,
  StarIcon,
  TrashIcon,
} from "@phosphor-icons/react"
import { Button } from "@astreex/ui/components/button"
import { Label } from "@astreex/ui/components/label"
import { Textarea } from "@astreex/ui/components/textarea"
import { cn } from "@astreex/ui/lib/utils"
import { useAction, useMutation } from "convex/react"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState, type FormEvent } from "react"

import { useProductContext } from "@/components/product/product-context"
import {
  canReuseOnboardingCheckout,
  clearOnboardingDraftStorage,
  createOnboardingDraft,
  draftStorageKey,
  MAX_DRAFT_KEYWORDS,
  mergeResearchKeywordDrafts,
  normalizeKeywordPhrase,
  onboardingDraftSchema,
  type OnboardingDraft,
  type OnboardingKeywordDraft,
} from "@/lib/onboarding-draft"

function XPlatformIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <title>X</title>
      <path d="M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z" />
    </svg>
  )
}

function RedditPlatformIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 216 216" className={className} aria-hidden="true">
      <defs>
        <radialGradient
          id="snoo-radial-gragient"
          cx="169.75"
          cy="92.19"
          r="50.98"
          fx="169.75"
          fy="92.19"
          gradientTransform="matrix(1 0 0 .87 0 11.64)"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#feffff" />
          <stop offset=".4" stopColor="#feffff" />
          <stop offset=".51" stopColor="#f9fcfc" />
          <stop offset=".62" stopColor="#edf3f5" />
          <stop offset=".7" stopColor="#dee9ec" />
          <stop offset=".72" stopColor="#d8e4e8" />
          <stop offset=".76" stopColor="#ccd8df" />
          <stop offset=".8" stopColor="#c8d5dd" />
          <stop offset=".83" stopColor="#ccd6de" />
          <stop offset=".85" stopColor="#d8dbe2" />
          <stop offset=".88" stopColor="#ede3e9" />
          <stop offset=".9" stopColor="#ffebef" />
        </radialGradient>
        <radialGradient
          xlinkHref="#snoo-radial-gragient"
          id="snoo-radial-gragient-2"
          cx="47.31"
          r="50.98"
          fx="47.31"
        />
        <radialGradient
          xlinkHref="#snoo-radial-gragient"
          id="snoo-radial-gragient-3"
          cx="109.61"
          cy="85.59"
          r="153.78"
          fx="109.61"
          fy="85.59"
          gradientTransform="matrix(1 0 0 .7 0 25.56)"
        />
        <radialGradient
          id="snoo-radial-gragient-4"
          cx="-6.01"
          cy="64.68"
          r="12.85"
          fx="-6.01"
          fy="64.68"
          gradientTransform="matrix(1.07 0 0 1.55 81.08 27.26)"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#f60" />
          <stop offset=".5" stopColor="#ff4500" />
          <stop offset=".7" stopColor="#fc4301" />
          <stop offset=".82" stopColor="#f43f07" />
          <stop offset=".92" stopColor="#e53812" />
          <stop offset="1" stopColor="#d4301f" />
        </radialGradient>
        <radialGradient
          xlinkHref="#snoo-radial-gragient-4"
          id="snoo-radial-gragient-5"
          cx="-73.55"
          cy="64.68"
          r="12.85"
          fx="-73.55"
          fy="64.68"
          gradientTransform="matrix(-1.07 0 0 1.55 62.87 27.26)"
        />
        <radialGradient
          id="snoo-radial-gragient-6"
          cx="107.93"
          cy="166.96"
          r="45.3"
          fx="107.93"
          fy="166.96"
          gradientTransform="matrix(1 0 0 .66 0 57.4)"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#172e35" />
          <stop offset=".29" stopColor="#0e1c21" />
          <stop offset=".73" stopColor="#030708" />
          <stop offset="1" />
        </radialGradient>
        <radialGradient
          xlinkHref="#snoo-radial-gragient"
          id="snoo-radial-gragient-7"
          cx="147.88"
          cy="32.94"
          r="39.77"
          fx="147.88"
          fy="32.94"
          gradientTransform="matrix(1 0 0 .98 0 .54)"
        />
        <radialGradient
          id="snoo-radial-gragient-8"
          cx="131.31"
          cy="73.08"
          r="32.6"
          fx="131.31"
          fy="73.08"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset=".48" stopColor="#7a9299" />
          <stop offset=".67" stopColor="#172e35" />
          <stop offset=".75" />
          <stop offset=".82" stopColor="#172e35" />
        </radialGradient>
      </defs>
      <path
        fill="#ff4500"
        strokeWidth="0"
        d="M108 0C48.35 0 0 48.35 0 108c0 29.82 12.09 56.82 31.63 76.37l-20.57 20.57C6.98 209.02 9.87 216 15.64 216H108c59.65 0 108-48.35 108-108S167.65 0 108 0Z"
      />
      <circle
        cx="169.22"
        cy="106.98"
        r="25.22"
        fill="url(#snoo-radial-gragient)"
        strokeWidth="0"
      />
      <circle
        cx="46.78"
        cy="106.98"
        r="25.22"
        fill="url(#snoo-radial-gragient-2)"
        strokeWidth="0"
      />
      <ellipse
        cx="108.06"
        cy="128.64"
        fill="url(#snoo-radial-gragient-3)"
        strokeWidth="0"
        rx="72"
        ry="54"
      />
      <path
        fill="url(#snoo-radial-gragient-4)"
        strokeWidth="0"
        d="M86.78 123.48c-.42 9.08-6.49 12.38-13.56 12.38s-12.46-4.93-12.04-14.01c.42-9.08 6.49-15.02 13.56-15.02s12.46 7.58 12.04 16.66Z"
      />
      <path
        fill="url(#snoo-radial-gragient-5)"
        strokeWidth="0"
        d="M129.35 123.48c.42 9.08 6.49 12.38 13.56 12.38s12.46-4.93 12.04-14.01c-.42-9.08-6.49-15.02-13.56-15.02s-12.46 7.58-12.04 16.66Z"
      />
      <ellipse
        cx="79.63"
        cy="116.37"
        fill="#ffc49c"
        strokeWidth="0"
        rx="2.8"
        ry="3.05"
      />
      <ellipse
        cx="146.21"
        cy="116.37"
        fill="#ffc49c"
        strokeWidth="0"
        rx="2.8"
        ry="3.05"
      />
      <path
        fill="url(#snoo-radial-gragient-6)"
        strokeWidth="0"
        d="M108.06 142.92c-8.76 0-17.16.43-24.92 1.22-1.33.13-2.17 1.51-1.65 2.74 4.35 10.39 14.61 17.69 26.57 17.69s22.23-7.3 26.57-17.69c.52-1.23-.33-2.61-1.65-2.74-7.77-.79-16.16-1.22-24.92-1.22Z"
      />
      <circle
        cx="147.49"
        cy="49.43"
        r="17.87"
        fill="url(#snoo-radial-gragient-7)"
        strokeWidth="0"
      />
      <path
        fill="url(#snoo-radial-gragient-8)"
        strokeWidth="0"
        d="M107.8 76.92c-2.14 0-3.87-.89-3.87-2.27 0-16.01 13.03-29.04 29.04-29.04 2.14 0 3.87 1.73 3.87 3.87s-1.73 3.87-3.87 3.87c-11.74 0-21.29 9.55-21.29 21.29 0 1.38-1.73 2.27-3.87 2.27Z"
      />
      <path
        fill="#842123"
        strokeWidth="0"
        d="M62.82 122.65c.39-8.56 6.08-14.16 12.69-14.16 6.26 0 11.1 6.39 11.28 14.33.17-8.88-5.13-15.99-12.05-15.99s-13.14 6.05-13.56 15.2c-.42 9.15 4.97 13.83 12.04 13.83h.52c-6.44-.16-11.3-4.79-10.91-13.2Zm90.48 0c-.39-8.56-6.08-14.16-12.69-14.16-6.26 0-11.1 6.39-11.28 14.33-.17-8.88 5.13-15.99 12.05-15.99 7.07 0 13.14 6.05 13.56 15.2.42 9.15-4.97 13.83-12.04 13.83h-.52c6.44-.16 11.3-4.79 10.91-13.2Z"
      />
    </svg>
  )
}

function HackerNewsPlatformIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 122.88 122.88" className={className} aria-hidden="true">
      <g>
        <path
          fill="#FF6600"
          d="M18.43,0h86.02c10.18,0,18.43,8.25,18.43,18.43v86.02c0,10.18-8.25,18.43-18.43,18.43H18.43 C8.25,122.88,0,114.63,0,104.45l0-86.02C0,8.25,8.25,0,18.43,0L18.43,0z"
        />
        <polygon
          fill="#FFFFFF"
          points="29.76,21.84 42,21.84 61.44,60.72 80.88,21.36 93.12,21.36 66.24,70.32 66.24,102.96 56.64,102.96 56.64,70.32 29.76,21.84"
        />
      </g>
    </svg>
  )
}

const platforms = [
  { label: "X", value: "x" as const, icon: XPlatformIcon },
  { label: "Reddit", value: "reddit" as const, icon: RedditPlatformIcon },
  {
    label: "Hacker News",
    value: "hacker_news" as const,
    icon: HackerNewsPlatformIcon,
  },
] as const

const STEPS = [
  { step: 1, title: "Company", description: "Website & noise filtering" },
  { step: 2, title: "Keywords", description: "Terms & AI context" },
  { step: 3, title: "Access", description: "Choose a plan" },
] as const

function clientId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `keyword-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function checkoutKey(workspaceId: string, plan: string): string {
  return `web:${workspaceId}:${plan}:${clientId()}`.slice(0, 200)
}

function sanitizeWebsiteInput(value: string): string {
  return value.trim().replace(/^(https?:\/\/|\/\/)/i, "")
}

function buildFullWebsiteUrl(input: string): string {
  const sanitized = sanitizeWebsiteInput(input)
  return sanitized ? `https://${sanitized}` : ""
}

function cleanDraftInitial(draft: OnboardingDraft): OnboardingDraft {
  const cleanedKeywords = draft.keywords.filter(
    (k) =>
      k.phrase.trim() &&
      k.phrase.trim() !== "Personal workspace" &&
      k.phrase.trim() !== draft.workspaceName,
  )

  const cleanedFilteringContext =
    draft.filteringContext.trim() === "Personal workspace" ||
    draft.filteringContext.trim() === draft.workspaceName
      ? ""
      : draft.filteringContext

  return {
    ...draft,
    filteringContext: cleanedFilteringContext,
    websiteUrl: sanitizeWebsiteInput(draft.websiteUrl || ""),
    keywords:
      cleanedKeywords.length > 0
        ? cleanedKeywords
        : [
            {
              brandCandidate: true,
              clientId: clientId(),
              description: "",
              origin: "custom",
              phrase: "",
              platforms: ["x", "reddit", "hacker_news"],
              selected: true,
            },
          ],
  }
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

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="mb-10 space-y-3">
      {/* 3-Segment Progress Bars */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {STEPS.map(({ step }) => {
          const isComplete = currentStep > step
          const isCurrent = currentStep === step

          return (
            <div
              key={step}
              className="h-1 w-full overflow-hidden rounded-full bg-[var(--line)] transition-colors sm:h-1.5"
            >
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500 ease-out",
                  isComplete || isCurrent
                    ? "bg-[var(--accent)]"
                    : "w-0 bg-transparent",
                  isComplete ? "w-full" : isCurrent ? "w-full" : "w-0",
                )}
              />
            </div>
          )
        })}
      </div>

      {/* Step Labels */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {STEPS.map(({ step, title, description }) => {
          const isComplete = currentStep > step
          const isCurrent = currentStep === step

          return (
            <div key={step} className="flex flex-col">
              <div className="flex items-center gap-1.5">
                {isComplete ? (
                  <CheckIcon
                    className="size-3.5 shrink-0 text-[var(--accent)]"
                    weight="bold"
                  />
                ) : (
                  <span
                    className={cn(
                      "text-[11px] font-medium tabular-nums",
                      isCurrent
                        ? "text-[var(--accent)]"
                        : "text-muted-foreground/60",
                    )}
                  >
                    0{step}
                  </span>
                )}
                <span
                  className={cn(
                    "truncate text-xs font-semibold transition-colors",
                    isCurrent
                      ? "text-foreground"
                      : isComplete
                        ? "text-muted-foreground hover:text-foreground"
                        : "text-muted-foreground/50",
                  )}
                >
                  {title}
                </span>
              </div>
              <span className="text-muted-foreground/60 mt-0.5 hidden truncate pl-4 text-[11px] sm:block">
                {description}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function KeywordRow({
  keyword,
  index,
  total,
  onChange,
  onRemove,
}: {
  keyword: OnboardingKeywordDraft
  index: number
  total: number
  onChange: (keyword: OnboardingKeywordDraft) => void
  onRemove: () => void
}) {
  return (
    <div className="group border-b border-[var(--line)] p-3 transition-colors last:border-b-0 hover:bg-[var(--surface-hover)]/30 sm:px-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        {/* Keyword phrase input */}
        <div className="min-w-0 flex-1">
          <input
            type="text"
            value={keyword.phrase}
            onChange={(e) => onChange({ ...keyword, phrase: e.target.value })}
            placeholder="e.g. Acme, Acme Cloud, or @acmedev"
            className="text-foreground placeholder:text-muted-foreground/40 h-8 w-full border-0 bg-transparent px-0 text-sm font-medium shadow-none outline-none focus:ring-0 focus:outline-none"
            autoFocus={index === total - 1 && !keyword.phrase}
          />
        </div>

        {/* Platform icon toggles & Actions */}
        <div className="flex shrink-0 items-center justify-between gap-2 sm:justify-end">
          <div className="flex items-center gap-1.5">
            {platforms.map(({ label, value, icon: IconComponent }) => {
              const active = keyword.platforms.includes(value)
              return (
                <button
                  key={value}
                  type="button"
                  role="switch"
                  aria-checked={active}
                  title={`${label}: ${active ? "Monitoring enabled" : "Monitoring disabled"}`}
                  onClick={() => {
                    const next = active
                      ? keyword.platforms.filter((p) => p !== value)
                      : [...new Set([...keyword.platforms, value])]
                    onChange({ ...keyword, platforms: next })
                  }}
                  className={cn(
                    "relative flex size-7 items-center justify-center rounded-md border transition-all duration-150",
                    active
                      ? "hover:border-foreground/30 border-[var(--line-strong)] bg-[var(--surface-active)] opacity-100 shadow-[var(--shadow-xs)]"
                      : "border-transparent bg-transparent opacity-25 grayscale hover:bg-[var(--surface-hover)] hover:opacity-60 hover:grayscale-0",
                  )}
                >
                  <IconComponent className="size-3.5 shrink-0" />
                </button>
              )
            })}
          </div>

          {total > 1 && (
            <button
              type="button"
              onClick={onRemove}
              className="text-muted-foreground/40 hover:text-destructive rounded p-1 transition-colors"
              aria-label="Remove keyword"
            >
              <TrashIcon className="size-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
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
  const [isResearching, setIsResearching] = useState(false)
  const [researchComplete, setResearchComplete] = useState(false)
  const [researchError, setResearchError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [manualDescriptionOpen, setManualDescriptionOpen] = useState(false)
  const [guidelinesOpen, setGuidelinesOpen] = useState(false)

  const researchPromiseRef = useRef<Promise<void> | null>(null)
  const draftRef = useRef(draft)
  draftRef.current = draft

  const researchCompany = useAction(api.onboardingDiscovery.researchCompany)
  const saveConfiguration = useMutation(
    api.onboarding.saveOnboardingConfiguration,
  )
  const createCheckout = useAction(api.billing.customer.createCheckout)

  useEffect(() => {
    const hydrateTimer = window.setTimeout(() => {
      const stored = readDraft(storageKey, workspace.workspace.name)
      const sanitized = cleanDraftInitial(stored)
      setDraft(sanitized)
      if (sanitized.manualDescription.trim()) {
        setManualDescriptionOpen(true)
      }
      setHydrated(true)
    }, 0)
    return () => window.clearTimeout(hydrateTimer)
  }, [storageKey, workspace.workspace.name])

  useEffect(() => {
    if (hydrated) persistDraft(storageKey, draft)
  }, [draft, hydrated, storageKey])

  const duplicate = (() => {
    const seen = new Set<string>()
    for (const keyword of draft.keywords) {
      if (!keyword.phrase.trim()) continue
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

  const addKeywordRow = () => {
    if (draft.keywords.length >= MAX_DRAFT_KEYWORDS) return
    setDraft((current) => ({
      ...current,
      keywords: [
        ...current.keywords,
        {
          brandCandidate: current.keywords.length === 0,
          clientId: clientId(),
          description: "",
          phrase: "",
          origin: "custom",
          platforms: ["x", "reddit", "hacker_news"],
          selected: true,
        },
      ],
    }))
  }

  const startResearch = async (event: FormEvent) => {
    event.preventDefault()
    const fullWebsiteUrl = buildFullWebsiteUrl(draft.websiteUrl)
    const hasInput = Boolean(fullWebsiteUrl || draft.manualDescription.trim())

    if (!hasInput) {
      setError("Enter your company website or describe your company.")
      return
    }

    setError(null)
    setResearchError(null)
    setIsResearching(true)
    setResearchComplete(false)

    // Immediately advance to Step 2 so the user can start editing keywords seamlessly
    setDraft((current) => {
      const validKeywords = current.keywords.filter(
        (k) =>
          k.phrase.trim() &&
          k.phrase.trim() !== "Personal workspace" &&
          k.phrase.trim() !== current.workspaceName,
      )
      return {
        ...current,
        step: 2,
        filteringContext:
          current.manualDescription.trim() || current.filteringContext,
        keywords:
          validKeywords.length > 0
            ? validKeywords
            : [
                {
                  brandCandidate: true,
                  clientId: clientId(),
                  description: "",
                  origin: "custom",
                  phrase: "",
                  platforms: ["x", "reddit", "hacker_news"],
                  selected: true,
                },
              ],
      }
    })

    // Perform research in the background (non-blocking)
    const researchPromise = (async () => {
      try {
        const result = await researchCompany({
          ...(draftRef.current.manualDescription.trim()
            ? { manualDescription: draftRef.current.manualDescription }
            : {}),
          ...(fullWebsiteUrl ? { websiteUrl: fullWebsiteUrl } : {}),
        })

        if (result.state === "completed") {
          setDraft((current) => {
            const hasCustomFilteringContext = Boolean(
              current.filteringContext.trim(),
            )
            const hasCustomFilteringGuidelines = Boolean(
              current.filteringGuidelines.trim(),
            )

            return {
              ...current,
              filteringContext: hasCustomFilteringContext
                ? current.filteringContext
                : result.filteringContext || current.filteringContext,
              filteringGuidelines: hasCustomFilteringGuidelines
                ? current.filteringGuidelines
                : result.filteringGuidelines || current.filteringGuidelines,
              keywords: mergeResearchKeywordDrafts(
                current.keywords,
                result.suggestions.map((suggestion) => ({
                  ...suggestion,
                  clientId: clientId(),
                  origin: "suggestion" as const,
                  selected: true,
                })),
              ),
            }
          })
          setResearchComplete(true)
          setResearchError(null)
        } else if (result.state === "rate_limited") {
          setResearchError(
            "AI research rate limit reached. You can configure keywords manually below.",
          )
        } else if (result.state === "provider_unconfigured") {
          setResearchError(
            result.message ||
              "AI research is temporarily unavailable. You can configure keywords manually below.",
          )
        } else if (result.state === "failed") {
          setResearchError(
            result.message ||
              "Could not complete automatic company research. You can configure keywords manually below.",
          )
        }
      } catch (researchErr) {
        setResearchError(
          researchErr instanceof Error
            ? researchErr.message
            : "Could not complete automatic research. You can configure keywords manually below.",
        )
      } finally {
        setIsResearching(false)
      }
    })()

    researchPromiseRef.current = researchPromise
  }

  const skipToManualKeywords = () => {
    setError(null)
    setIsResearching(false)
    setDraft((current) => {
      const validKeywords = current.keywords.filter(
        (k) =>
          k.phrase.trim() &&
          k.phrase.trim() !== "Personal workspace" &&
          k.phrase.trim() !== current.workspaceName,
      )
      return {
        ...current,
        step: 2,
        filteringContext:
          current.manualDescription.trim() ||
          (current.filteringContext !== "Personal workspace" &&
          current.filteringContext !== current.workspaceName
            ? current.filteringContext
            : ""),
        keywords:
          validKeywords.length > 0
            ? validKeywords
            : [
                {
                  brandCandidate: true,
                  clientId: clientId(),
                  description: "",
                  origin: "custom",
                  phrase: "",
                  platforms: ["x", "reddit", "hacker_news"],
                  selected: true,
                },
              ],
      }
    })
  }

  const continueToPlans = () => {
    const validKeywords = draft.keywords.filter((k) => k.phrase.trim())
    if (validKeywords.length === 0) {
      setError("Add at least one keyword to monitor.")
      return
    }
    if (validKeywords.some((keyword) => keyword.platforms.length === 0)) {
      setError("Every keyword needs at least one platform selected.")
      return
    }
    if (duplicate) {
      setError(`“${duplicate}” is entered more than once.`)
      return
    }
    setError(null)
    const validCount = validKeywords.length
    const fitPlan =
      validCount <= 3 ? "starter" : validCount <= 6 ? "growth" : "scale"

    setDraft((current) => ({
      ...current,
      filteringContext: current.filteringContext.trim(),
      keywords: current.keywords.map((k) => ({
        ...k,
        selected: Boolean(k.phrase.trim()),
      })),
      selectedPlan: fitPlan,
      step: 3,
    }))
  }

  const validKeywordCount =
    draft.keywords.filter((k) => k.phrase.trim()).length || 1
  const fitPlan =
    validKeywordCount <= 3
      ? "starter"
      : validKeywordCount <= 6
        ? "growth"
        : "scale"
  const activePlan = draft.selectedPlan ?? fitPlan

  const activate = async () => {
    const plan = activePlan
    if (!plan) {
      setError("Choose the free evaluation or a paid plan.")
      return
    }
    setPending(true)
    setError(null)

    // If research is finishing in the background, wait briefly up to 2.5s to capture AI noise filters & suggestions
    if (isResearching && researchPromiseRef.current) {
      try {
        await Promise.race([
          researchPromiseRef.current,
          new Promise((resolve) => setTimeout(resolve, 2500)),
        ])
      } catch {
        // Non-blocking
      }
    }

    try {
      const currentDraft = draftRef.current
      const validKeywords = currentDraft.keywords.filter((k) => k.phrase.trim())
      const result = await saveConfiguration({
        accessPath: plan,
        filteringContext:
          currentDraft.filteringContext.trim() || workspace.workspace.name,
        filteringGuidelines: currentDraft.filteringGuidelines.trim(),
        keywords: validKeywords.map((keyword, selectionOrder) => ({
          brandCandidate: keyword.brandCandidate,
          ...(keyword.description.trim()
            ? { description: keyword.description.trim() }
            : {}),
          phrase: keyword.phrase.trim().replace(/\s+/g, " "),
          platforms: keyword.platforms,
          selectionOrder,
        })),
        workspaceName: currentDraft.workspaceName || workspace.workspace.name,
      })
      const paidPlan =
        plan === "free"
          ? null
          : (PLAN_DEFINITIONS.find((definition) => definition.id === plan) ??
            null)
      const completionCounts = paidPlan
        ? {
            activeCount: Math.min(validKeywords.length, paidPlan.keywordLimit),
            pausedCount: Math.max(
              0,
              validKeywords.length - paidPlan.keywordLimit,
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

      const existing = currentDraft.checkout
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
          className="text-muted-foreground size-6 animate-spin"
          aria-label="Loading onboarding"
        />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <StepIndicator currentStep={draft.step} />

      {draft.step === 1 && (
        <div className="space-y-6">
          <div>
            <h1 className="text-foreground font-serif text-2xl font-medium tracking-tight sm:text-3xl">
              Tell us about your company
            </h1>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
              Astreex reads your public website and market data to discover
              high-value keywords and teach the AI how to accurately filter out
              noise, competitor spam, and irrelevant mentions.
            </p>
          </div>

          <form
            onSubmit={startResearch}
            noValidate
            className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-sm)] sm:p-8"
          >
            <div className="space-y-5">
              <div>
                <Label
                  htmlFor="company-website"
                  className="text-foreground text-sm font-medium"
                >
                  Company website
                </Label>
                <div className="mt-2 flex h-10 w-full items-center rounded-lg border border-[var(--line)] bg-[var(--surface-inset)] px-3 transition-colors focus-within:border-[var(--line-strong)]">
                  <GlobeIcon
                    className="text-muted-foreground mr-2 size-4 shrink-0"
                    aria-hidden="true"
                  />
                  <span className="text-muted-foreground/60 font-mono text-[13px] tracking-tight select-none">
                    https://
                  </span>
                  <input
                    id="company-website"
                    type="text"
                    inputMode="url"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    value={draft.websiteUrl}
                    onChange={(event) => {
                      const clean = sanitizeWebsiteInput(event.target.value)
                      setDraft((current) => ({
                        ...current,
                        websiteUrl: clean,
                      }))
                      setError(null)
                    }}
                    onPaste={(event) => {
                      event.preventDefault()
                      const pasted = event.clipboardData.getData("text")
                      const clean = sanitizeWebsiteInput(pasted)
                      setDraft((current) => ({
                        ...current,
                        websiteUrl: clean,
                      }))
                      setError(null)
                    }}
                    placeholder="example.com"
                    className="text-foreground placeholder:text-muted-foreground/30 min-w-0 flex-1 border-0 bg-transparent py-2 pr-0 pl-0.5 font-mono text-[13px] focus:outline-none"
                    autoFocus
                  />
                </div>
              </div>

              {/* Collapsible Manual Description with smooth height transition */}
              <div className="border-t border-[var(--line)] pt-3">
                <button
                  type="button"
                  onClick={() =>
                    setManualDescriptionOpen((current) => !current)
                  }
                  className="text-muted-foreground hover:text-foreground group inline-flex items-center gap-2 text-xs font-medium transition-colors"
                >
                  <CaretDownIcon
                    className={cn(
                      "size-3.5 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                      manualDescriptionOpen && "rotate-180",
                    )}
                    aria-hidden="true"
                  />
                  <span>
                    {manualDescriptionOpen
                      ? "Hide company description"
                      : "Don't have a public website? Describe your company instead"}
                  </span>
                </button>

                <div
                  className="grid transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
                  style={{
                    gridTemplateRows: manualDescriptionOpen ? "1fr" : "0fr",
                  }}
                >
                  <div className="overflow-hidden">
                    <div className="mt-4 space-y-2 pt-1">
                      <div className="flex items-center justify-between">
                        <Label
                          htmlFor="manual-description"
                          className="text-foreground text-xs font-medium"
                        >
                          Company description{" "}
                          <span className="text-muted-foreground font-normal">
                            (optional fallback)
                          </span>
                        </Label>
                        <span className="text-muted-foreground text-[11px] tabular-nums">
                          {draft.manualDescription.length}/1,000
                        </span>
                      </div>
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
                        className="min-h-24 text-xs leading-relaxed"
                        placeholder="Describe what your company does, key products, and target audience. Mention any common names or terms to ignore so AI can filter out false positives."
                      />
                      <p className="text-muted-foreground text-[11px]">
                        Astreex AI uses this description to understand your
                        market, discover relevant keywords, and filter out
                        noise.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="bg-destructive/10 border-destructive/20 text-destructive mt-5 rounded-lg border p-3.5 text-xs font-medium"
              >
                {error}
              </div>
            )}

            <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button type="submit" className="h-10 px-6 text-sm font-medium">
                Research company
              </Button>

              <Button
                type="button"
                variant="ghost"
                onClick={skipToManualKeywords}
                className="text-muted-foreground hover:text-foreground text-xs font-medium"
              >
                Skip research & set up manually
                <ArrowRightIcon className="size-3.5" />
              </Button>
            </div>
          </form>
        </div>
      )}

      {draft.step === 2 && (
        <section className="space-y-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-foreground font-serif text-2xl font-medium tracking-tight sm:text-3xl">
              Choose what to monitor
            </h1>
            <p className="text-muted-foreground text-sm">
              Add the keywords you want Astreex to monitor across Reddit, X, and
              Hacker News.
            </p>
          </div>

          {/* Inline Live AI Research Status */}
          {isResearching && (
            <div className="animate-in fade-in-50 flex items-center justify-between gap-3 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-4 py-2.5 text-xs text-[var(--accent-soft-ink)] duration-200">
              <div className="flex items-center gap-2.5">
                <CircleNotchIcon className="size-3.5 shrink-0 animate-spin text-[var(--accent)]" />
                <span className="font-medium">
                  Astreex AI is analyzing{" "}
                  {draft.websiteUrl
                    ? `https://${draft.websiteUrl}`
                    : "your company"}{" "}
                  to discover keywords & noise filters…
                </span>
              </div>
              <span className="text-muted-foreground hidden text-[11px] sm:inline">
                You can start typing below
              </span>
            </div>
          )}

          {researchComplete && !isResearching && (
            <div className="text-muted-foreground animate-in fade-in-50 flex items-center gap-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-inset)] px-4 py-2.5 text-xs duration-200">
              <SparkleIcon
                className="size-4 shrink-0 text-[var(--accent)]"
                weight="fill"
              />
              <span>
                Discovered keywords and configured noise filtering rules from{" "}
                {draft.websiteUrl
                  ? `https://${draft.websiteUrl}`
                  : "your company"}
                .
              </span>
            </div>
          )}

          {researchError && !isResearching && (
            <div className="text-muted-foreground animate-in fade-in-50 flex items-center justify-between gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface-inset)] px-4 py-2.5 text-xs duration-200">
              <div className="flex items-center gap-2">
                <span className="shrink-0 font-semibold text-[var(--accent)]">
                  Note:
                </span>
                <span>{researchError}</span>
              </div>
              <button
                type="button"
                onClick={() => setResearchError(null)}
                className="text-muted-foreground/60 hover:text-foreground shrink-0 text-xs underline"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Keywords List (Clean Notion table) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-foreground text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                Monitored terms (
                {draft.keywords.filter((k) => k.phrase.trim()).length})
              </h2>
            </div>

            <div className="divide-y divide-[var(--line)] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
              {draft.keywords.map((keyword, index) => (
                <KeywordRow
                  key={keyword.clientId}
                  keyword={keyword}
                  index={index}
                  total={draft.keywords.length}
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

              {/* Add keyword row */}
              {draft.keywords.length < MAX_DRAFT_KEYWORDS && (
                <button
                  type="button"
                  onClick={addKeywordRow}
                  className="text-muted-foreground hover:text-foreground flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs font-medium transition-colors hover:bg-[var(--surface-hover)]"
                >
                  <PlusIcon className="size-3.5" />
                  <span>Add keyword</span>
                </button>
              )}
            </div>
          </div>

          {/* Collapsible AI Filtering Rules with smooth height transition */}
          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)]">
            <button
              type="button"
              onClick={() => setGuidelinesOpen((current) => !current)}
              className="group flex w-full items-center justify-between text-left"
              aria-expanded={guidelinesOpen}
            >
              <div className="flex items-center gap-2">
                <span className="text-foreground text-xs font-medium">
                  AI noise filtering rules
                </span>
                <span className="text-muted-foreground text-[11px]">
                  (optional rules for disambiguation)
                </span>
              </div>
              <CaretDownIcon
                className={cn(
                  "text-muted-foreground size-3.5 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                  guidelinesOpen && "rotate-180",
                )}
              />
            </button>

            <div
              className="grid transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{
                gridTemplateRows: guidelinesOpen ? "1fr" : "0fr",
              }}
            >
              <div className="overflow-hidden">
                <div className="mt-3.5 space-y-3.5 border-t border-[var(--line)] pt-3.5">
                  <div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="company-context" className="text-xs">
                        Company & product context
                      </Label>
                      <span className="text-muted-foreground text-[11px] tabular-nums">
                        {draft.filteringContext.length}/1,000
                      </span>
                    </div>
                    <Textarea
                      id="company-context"
                      value={draft.filteringContext}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          filteringContext: event.target.value,
                        }))
                      }
                      maxLength={1_000}
                      className="mt-1.5 min-h-18 text-xs leading-relaxed"
                      placeholder="Briefly describes your company, products, and target audience to guide relevance classification."
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="filtering-guidelines" className="text-xs">
                        Filtering guidelines
                      </Label>
                      <span className="text-muted-foreground text-[11px] tabular-nums">
                        {draft.filteringGuidelines.length}/1,000
                      </span>
                    </div>
                    <Textarea
                      id="filtering-guidelines"
                      value={draft.filteringGuidelines}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          filteringGuidelines: event.target.value,
                        }))
                      }
                      maxLength={1_000}
                      className="mt-1.5 min-h-18 text-xs leading-relaxed"
                      placeholder="Examples of mentions to ignore (e.g. unrelated products or movies with the same name)."
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="bg-destructive/10 border-destructive/20 text-destructive rounded-lg border p-3.5 text-xs font-medium"
            >
              {error}
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDraft((current) => ({ ...current, step: 1 }))}
              className="text-muted-foreground hover:text-foreground text-xs font-medium"
            >
              Back
            </Button>
            <Button
              type="button"
              onClick={continueToPlans}
              className="px-6 text-sm font-medium"
            >
              Continue
            </Button>
          </div>
        </section>
      )}

      {draft.step === 3 && (
        <section className="space-y-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-foreground font-serif text-2xl font-medium tracking-tight sm:text-3xl">
              Choose your access plan
            </h1>
            <p className="text-muted-foreground text-sm">
              All plans include X, Reddit, and Hacker News monitoring, AI
              categorization, custom categories, and email digests.
            </p>
          </div>

          {/* Unified Notion-style List Selector */}
          <div className="divide-y divide-[var(--line)] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
            {/* Free Evaluation Row */}
            <div
              onClick={() =>
                setDraft((current) => ({ ...current, selectedPlan: "free" }))
              }
              className={cn(
                "flex cursor-pointer items-center justify-between p-4 transition-colors sm:px-5",
                activePlan === "free"
                  ? "bg-[var(--surface-active)]"
                  : "hover:bg-[var(--surface-hover)]/40",
              )}
            >
              <div className="flex min-w-0 items-center gap-3.5">
                <div
                  className={cn(
                    "flex size-4.5 shrink-0 items-center justify-center rounded-full border transition-colors",
                    activePlan === "free"
                      ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                      : "border-[var(--line-strong)] bg-transparent",
                  )}
                >
                  {activePlan === "free" && (
                    <CheckIcon className="size-3" weight="bold" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-foreground text-sm font-semibold">
                      Free evaluation
                    </span>
                    <span className="text-muted-foreground text-xs">
                      · 1 active keyword, first 100 mentions
                    </span>
                  </div>
                  <p className="text-muted-foreground/70 mt-0.5 text-xs">
                    No credit card required
                  </p>
                </div>
              </div>
              <div className="shrink-0 pl-4 text-right">
                <span className="text-foreground text-base font-bold">$0</span>
                <span className="text-muted-foreground text-xs"> / free</span>
              </div>
            </div>

            {/* Paid Plans Rows */}
            {PLAN_DEFINITIONS.map((plan) => {
              const isSelected = activePlan === plan.id
              const pausedCount = Math.max(
                0,
                validKeywordCount - plan.keywordLimit,
              )

              return (
                <div
                  key={plan.id}
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      selectedPlan: plan.id,
                    }))
                  }
                  className={cn(
                    "flex cursor-pointer items-center justify-between p-4 transition-colors sm:px-5",
                    isSelected
                      ? "bg-[var(--surface-active)]"
                      : "hover:bg-[var(--surface-hover)]/40",
                  )}
                >
                  <div className="flex min-w-0 items-center gap-3.5">
                    <div
                      className={cn(
                        "flex size-4.5 shrink-0 items-center justify-center rounded-full border transition-colors",
                        isSelected
                          ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                          : "border-[var(--line-strong)] bg-transparent",
                      )}
                    >
                      {isSelected && (
                        <CheckIcon className="size-3" weight="bold" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-foreground text-sm font-semibold">
                          {plan.name}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          · {plan.keywordLimit} active keywords,{" "}
                          {plan.monthlyMentionLimit.toLocaleString()}{" "}
                          mentions/mo
                        </span>
                      </div>
                      <p className="text-muted-foreground/70 mt-0.5 text-xs">
                        {validKeywordCount} keyword
                        {validKeywordCount === 1 ? "" : "s"}
                        {pausedCount > 0
                          ? ` (${pausedCount} would start paused)`
                          : " (all active)"}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 pl-4 text-right">
                    <span className="text-foreground text-base font-bold">
                      ${plan.priceUsd}
                    </span>
                    <span className="text-muted-foreground text-xs"> / mo</span>
                  </div>
                </div>
              )
            })}
          </div>

          {error && (
            <div
              role="alert"
              className="bg-destructive/10 border-destructive/20 text-destructive rounded-lg border p-3.5 text-xs font-medium"
            >
              {error}
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDraft((current) => ({ ...current, step: 2 }))}
              disabled={pending}
              className="text-muted-foreground hover:text-foreground text-xs font-medium"
            >
              Back
            </Button>
            <Button
              type="button"
              onClick={() => void activate()}
              disabled={pending || !activePlan}
              className="px-6 text-sm font-medium"
            >
              {pending ? (
                <CircleNotchIcon className="size-4 animate-spin" />
              ) : null}
              {activePlan === "free"
                ? "Start free evaluation"
                : "Continue to checkout"}
            </Button>
          </div>
        </section>
      )}
    </div>
  )
}
