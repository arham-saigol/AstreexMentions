export default function MetricsLoading() {
  return (
    <div
      className="space-y-6"
      role="status"
      aria-live="polite"
      aria-label="Loading metrics"
    >
      <span className="sr-only">Loading metrics</span>

      <div
        className="admin-panel bg-muted/45 h-28 animate-pulse motion-reduce:animate-none"
        aria-hidden="true"
      />

      <div
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        aria-hidden="true"
      >
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="admin-panel bg-muted/45 h-28 animate-pulse motion-reduce:animate-none"
          />
        ))}
      </div>

      <div
        className="admin-panel bg-muted/45 h-[24rem] animate-pulse motion-reduce:animate-none"
        aria-hidden="true"
      />

      <div className="grid gap-4 xl:grid-cols-2" aria-hidden="true">
        <div className="admin-panel bg-muted/45 h-[28rem] animate-pulse motion-reduce:animate-none" />
        <div className="admin-panel bg-muted/45 h-[28rem] animate-pulse motion-reduce:animate-none" />
      </div>
    </div>
  )
}
