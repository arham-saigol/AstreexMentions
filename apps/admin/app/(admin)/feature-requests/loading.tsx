export default function FeatureRequestsLoading() {
  return (
    <div
      className="space-y-6"
      role="status"
      aria-live="polite"
      aria-label="Loading feature requests"
    >
      <span className="sr-only">Loading feature requests</span>
      <div
        className="admin-panel bg-muted/45 h-40 animate-pulse motion-reduce:animate-none"
        aria-hidden="true"
      />
      <div className="space-y-3" aria-hidden="true">
        <div className="bg-muted/45 h-12 animate-pulse rounded-md motion-reduce:animate-none" />
        <div className="admin-panel bg-muted/45 h-52 animate-pulse motion-reduce:animate-none" />
        <div className="admin-panel bg-muted/45 h-52 animate-pulse motion-reduce:animate-none" />
      </div>
    </div>
  )
}
