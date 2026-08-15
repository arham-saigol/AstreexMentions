"use client"

import { useId, type ChangeEvent, type ReactNode } from "react"

import { cn } from "../lib/utils"

/**
 * Native switch styled to the kit. Its API supports a `value`/`onChange`
 * pair, an optional internal
 * `label` (visually hidden when `isLabelHidden`), `id` forwarded to the native
 * control so an external <label htmlFor> keeps working, and a `ref`.
 */
export type SwitchProps = {
  id?: string
  label?: ReactNode
  isLabelHidden?: boolean
  value?: boolean
  onChange?: (checked: boolean, event: ChangeEvent<HTMLInputElement>) => void
  isDisabled?: boolean
  className?: string
  ref?: React.Ref<HTMLInputElement>
}

function Switch({
  id,
  label,
  isLabelHidden = false,
  value = false,
  onChange,
  isDisabled = false,
  className,
  ref,
}: SwitchProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span className="relative inline-flex shrink-0">
        <input
          id={inputId}
          ref={ref}
          type="checkbox"
          role="switch"
          checked={value}
          disabled={isDisabled}
          onChange={(event) => onChange?.(event.currentTarget.checked, event)}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className="block h-[21px] w-9 rounded-full border border-[var(--line-strong)] bg-[var(--surface-inset)] transition-[background-color,border-color] duration-[var(--medium)] ease-[var(--ease-out)] peer-checked:border-[var(--accent)] peer-checked:bg-[var(--accent)] peer-disabled:opacity-50"
        />
        {/* focus ring rendered on the track (the input is sr-only) */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -inset-1 rounded-full opacity-0 ring-2 ring-[var(--focus)] ring-offset-2 ring-offset-[var(--canvas)] transition-opacity peer-focus-visible:opacity-100"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-[3px] left-[3px] h-[13px] w-[13px] rounded-full bg-[var(--text-tertiary)] shadow-[var(--shadow-sm)] transition-[transform,background-color] duration-[var(--medium)] ease-[var(--ease-spring)] peer-checked:translate-x-[15px] peer-checked:bg-[var(--on-accent)]"
        />
      </span>
      {label != null && (
        <label
          htmlFor={inputId}
          className={cn(
            "cursor-pointer text-[12px] font-medium text-[var(--ink-secondary)] select-none",
            isLabelHidden && "sr-only",
            isDisabled && "cursor-default opacity-50",
          )}
        >
          {label}
        </label>
      )}
    </span>
  )
}

export { Switch }
