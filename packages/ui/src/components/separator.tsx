import { Divider, type DividerProps } from "@astryxdesign/core/Divider"

type SeparatorProps = Omit<DividerProps, "label"> & {
  /** Decorative separators are hidden from assistive technology by default. */
  decorative?: boolean
}

/**
 * Compatibility wrapper over Astryx Divider. Existing separators are purely
 * visual; aria-hidden preserves that contract even though Astryx correctly
 * emits role="separator" for semantic dividers.
 */
function Separator({ decorative = true, ...props }: SeparatorProps) {
  return (
    <Divider
      data-slot="separator"
      aria-hidden={decorative ? "true" : undefined}
      {...props}
    />
  )
}

export { Separator }
export type { SeparatorProps }
