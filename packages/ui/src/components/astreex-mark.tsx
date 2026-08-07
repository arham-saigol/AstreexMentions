import { useId, type ComponentProps } from "react"

import { cn } from "../lib/utils"

type AstreexMarkProps = ComponentProps<"svg"> & {
  title?: string
}

function AstreexMark({ className, title, ...props }: AstreexMarkProps) {
  const titleId = useId()

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-labelledby={title ? titleId : undefined}
      className={cn("text-foreground size-8 shrink-0", className)}
      {...props}
    >
      {title && <title id={titleId}>{title}</title>}
      <g
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <path d="M12 3v18" />
        <path d="M12 3v18" transform="rotate(60 12 12)" />
        <path d="M12 3v18" transform="rotate(120 12 12)" />
      </g>
      <circle cx="12" cy="12" r="2.4" fill="var(--signal)" />
    </svg>
  )
}

export { AstreexMark }
export type { AstreexMarkProps }
