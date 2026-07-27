import { useId, type ComponentProps } from "react"

import { cn } from "../lib/utils"

type AstreexMarkProps = ComponentProps<"svg"> & {
  title?: string
}

function AstreexMark({ className, title, ...props }: AstreexMarkProps) {
  const titleId = useId()

  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-labelledby={title ? titleId : undefined}
      className={cn("text-primary size-8 shrink-0", className)}
      {...props}
    >
      {title && <title id={titleId}>{title}</title>}
      <path
        d="M6.25 23.75 14.1 6.8a2.1 2.1 0 0 1 3.8 0l7.85 16.95"
        stroke="currentColor"
        strokeWidth="3.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10.25 19.25h11.5"
        stroke="currentColor"
        strokeWidth="3.25"
        strokeLinecap="round"
      />
      <circle cx="25.5" cy="8" r="2.5" fill="currentColor" />
    </svg>
  )
}

export { AstreexMark }
export type { AstreexMarkProps }
