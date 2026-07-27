import type { ReactNode } from "react"

type SectionHeadingProps = {
  eyebrow: string
  title: string
  description: string
  aside?: ReactNode
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  aside,
}: SectionHeadingProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,42rem)_minmax(16rem,1fr)] lg:items-end">
      <div>
        <p className="text-primary text-sm font-semibold tracking-wide uppercase">
          {eyebrow}
        </p>
        <h2 className="text-foreground mt-3 text-3xl font-semibold tracking-[-0.025em] text-balance sm:text-4xl">
          {title}
        </h2>
        <p className="text-muted-foreground mt-4 max-w-2xl text-base leading-7 text-pretty sm:text-lg">
          {description}
        </p>
      </div>
      {aside && <div>{aside}</div>}
    </div>
  )
}
