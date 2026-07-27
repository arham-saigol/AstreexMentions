export default function ChangelogLoading() {
  return (
    <div
      className="space-y-8"
      role="status"
      aria-live="polite"
      aria-label="Loading changelog management"
    >
      <span className="sr-only">Loading changelog management</span>
      <div
        className="admin-panel bg-muted/45 h-[34rem] animate-pulse motion-reduce:animate-none"
        aria-hidden="true"
      />
      <div className="space-y-3" aria-hidden="true">
        <div className="bg-muted/45 h-14 animate-pulse rounded-md motion-reduce:animate-none" />
        <div className="admin-panel bg-muted/45 h-64 animate-pulse motion-reduce:animate-none" />
        <div className="admin-panel bg-muted/45 h-64 animate-pulse motion-reduce:animate-none" />
      </div>
    </div>
  )
}
