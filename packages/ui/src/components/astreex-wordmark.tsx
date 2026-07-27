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
        "text-foreground inline-flex items-center gap-2 text-lg font-semibold tracking-tight",
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
