export default function DeletionsLoading() {
  return (
    <div
      className="space-y-5"
      aria-busy="true"
      aria-label="Loading deletion operations"
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="admin-panel bg-muted/35 h-28 animate-pulse"
          />
        ))}
      </div>
      <div className="admin-panel bg-muted/35 h-24 animate-pulse" />
      <div className="grid gap-5 xl:grid-cols-2">
        <div className="admin-panel bg-muted/35 h-80 animate-pulse" />
        <div className="admin-panel bg-muted/35 h-80 animate-pulse" />
      </div>
      <span className="sr-only">Loading account deletion operations.</span>
    </div>
  )
}
