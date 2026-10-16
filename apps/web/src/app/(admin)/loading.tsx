/** Skeleton shown while a dashboard page loads. */
export default function Loading() {
  return (
    <div className="flex animate-pulse flex-col gap-6" aria-busy="true">
      <div className="border-b border-border pb-5">
        <div className="h-8 w-48 rounded-sm bg-surface-muted" />
        <div className="mt-2 h-4 w-80 max-w-full rounded-sm bg-surface-muted" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-22 rounded-card border border-border bg-surface" />
        ))}
      </div>
      <div className="h-80 rounded-card border border-border bg-surface" />
    </div>
  );
}
