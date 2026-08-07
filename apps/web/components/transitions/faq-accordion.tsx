"use client"

import { ChevronDown } from "lucide-react"
import { useState } from "react"

import { cn } from "@astreex/ui/lib/utils"

type Faq = readonly [string, string]

/**
 * transitions.dev "accordion expand": height animates via grid-template-rows
 * 0fr↔1fr (no JS measurement) and the chevron flips with scaleY. Pure CSS
 * owns the motion; JS only toggles `data-open`. `prefers-reduced-motion` zeroes
 * the transitions in the stylesheet.
 */
export function FaqAccordion({ items }: { items: readonly Faq[] }) {
  return (
    <div className="border-t">
      {items.map(([question, answer], i) => (
        <AccordionItem key={i} question={question} answer={answer} />
      ))}
    </div>
  )
}

function AccordionItem({
  question,
  answer,
}: {
  question: string
  answer: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="t-acc group border-b" data-open={open ? "true" : "false"}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="text-foreground flex w-full list-none items-center justify-between gap-6 py-5 text-left text-lg font-medium tracking-[-0.01em]"
      >
        {question}
        <span
          className={cn(
            "t-acc-chevron size-5 shrink-0",
            open ? "text-accent-foreground" : "text-muted-foreground",
          )}
        >
          <ChevronDown className="size-5" aria-hidden="true" />
        </span>
      </button>
      <div className="t-acc-panel" aria-hidden={!open}>
        <div className="t-acc-panel-inner">
          <p className="text-muted-foreground max-w-2xl pb-6 text-sm leading-6">
            {answer}
          </p>
        </div>
      </div>
    </div>
  )
}
