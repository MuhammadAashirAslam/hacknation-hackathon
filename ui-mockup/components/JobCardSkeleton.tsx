export function JobCardSkeleton() {
  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3 animate-pulse">
      {/* Title skeleton */}
      <div className="space-y-2">
        <div className="h-5 bg-muted/30 rounded w-3/4" />
        <div className="h-4 bg-muted/30 rounded w-1/2" />
      </div>

      {/* Badges skeleton */}
      <div className="flex gap-2">
        <div className="h-6 bg-muted/30 rounded-full w-20" />
        <div className="h-6 bg-muted/30 rounded-full w-16" />
      </div>

      {/* Input/description skeleton */}
      <div className="h-4 bg-muted/30 rounded w-full" />

      {/* Reward info skeleton */}
      <div className="space-y-2 py-2 border-y border-border">
        <div className="flex justify-between">
          <div className="h-4 bg-muted/30 rounded w-16" />
          <div className="h-4 bg-muted/30 rounded w-24" />
        </div>
        <div className="flex justify-between">
          <div className="h-4 bg-muted/30 rounded w-12" />
          <div className="h-4 bg-muted/30 rounded w-20" />
        </div>
      </div>

      {/* Button skeleton */}
      <div className="flex justify-between items-center">
        <div className="h-4 bg-muted/30 rounded w-12" />
        <div className="h-9 bg-muted/30 rounded w-24" />
      </div>
    </div>
  );
}
