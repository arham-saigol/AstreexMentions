import { Skeleton } from "@astreex/ui/components/skeleton"

export default function ChangelogLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading published product changes</span>
      <div className="border-border border-b">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-16 sm:py-20 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-end">
          <div>
            <Skeleton className="h-6 w-40 rounded-full" />
            <Skeleton className="mt-6 h-11 w-full max-w-2xl sm:h-14" />
            <Skeleton className="mt-3 h-11 w-4/5 max-w-xl sm:h-14" />
            <div className="mt-6 space-y-3">
              <Skeleton className="h-5 w-full max-w-2xl" />
              <Skeleton className="h-5 w-4/5 max-w-xl" />
            </div>
          </div>
          <div className="border-border border-l pl-6">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-3 h-4 w-full" />
            <Skeleton className="mt-2 h-4 w-5/6" />
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-3 h-8 w-56" />
        <div className="border-border mt-10 divide-y border-y">
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className="grid gap-5 py-8 md:grid-cols-[12rem_minmax(0,1fr)_auto] md:gap-8"
            >
              <Skeleton className="h-4 w-32" />
              <div>
                <Skeleton className="h-7 w-3/4" />
                <Skeleton className="mt-4 h-4 w-full" />
                <Skeleton className="mt-2 h-4 w-4/5" />
              </div>
              <Skeleton className="size-9 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
