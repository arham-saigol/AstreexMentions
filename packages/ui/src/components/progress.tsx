import { cn } from "../lib/utils"

/**
 * Determinate progress bar with a 7px inset track and accent fill.
 * Values are clamped to 0–100; callers provide an `aria-label`.
 */
export type ProgressProps = {
  value?: number
  className?: string
  "aria-label": string
}

function Progress({
  value = 0,
  className,
  "aria-label": ariaLabel,
}: ProgressProps) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0))

  return (
    <div
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn(
        "relative h-[7px] w-full overflow-hidden rounded-full border border-[var(--line)] bg-[var(--surface-inset)]",
        className,
      )}
    >
      <span
        className="astro-progress-fill block h-full rounded-full bg-[var(--accent)]"
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}

export { Progress }
