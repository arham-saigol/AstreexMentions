import {
  ProgressBar,
  type ProgressBarProps,
} from "@astryxdesign/core/ProgressBar"

type ProgressProps = Omit<ProgressBarProps, "label" | "isLabelHidden"> & {
  "aria-label": string
}

/**
 * Compatibility wrapper over Astryx ProgressBar. Existing callers already
 * provide an accessible aria-label; Astryx renders that label off-screen while
 * standardizing all progress tracks to the design-system 8px height.
 */
function Progress({ "aria-label": label, ...props }: ProgressProps) {
  return <ProgressBar label={label} isLabelHidden {...props} />
}

export { Progress }
export type { ProgressProps }
