import type * as React from "react"

import { cn } from "../lib/utils"
import { AstreexMark } from "./astreex-mark"

type AstreexWordmarkProps = React.ComponentProps<"span"> & {
  markClassName?: string
}

function AstreexWordmark({
  className,
  markClassName,
  ...props
}: AstreexWordmarkProps) {
  return (
    <span
      data-slot="astreex-wordmark"
      className={cn(
        "text-foreground inline-flex items-center gap-2.5 font-serif text-[22px] font-medium tracking-[-0.02em]",
        className,
      )}
      {...props}
    >
      <AstreexMark className={cn("size-7", markClassName)} />
      <span>Astreex</span>
    </span>
  )
}

export { AstreexWordmark }
export type { AstreexWordmarkProps }
