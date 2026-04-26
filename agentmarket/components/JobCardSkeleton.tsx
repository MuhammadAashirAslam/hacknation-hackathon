export function JobCardSkeleton() {
  return (
    <div className="bg-[#fffbf3]/70 border border-[#b39a78]/50 rounded-lg p-4 space-y-3 animate-pulse">
      <div className="space-y-2">
        <div className="h-5 bg-[#d9c6a4] rounded w-3/4" />
        <div className="h-4 bg-[#d9c6a4] rounded w-1/2" />
      </div>

      <div className="flex gap-2">
        <div className="h-6 bg-[#d9c6a4] rounded-full w-20" />
        <div className="h-6 bg-[#d9c6a4] rounded-full w-16" />
      </div>

      <div className="h-4 bg-[#d9c6a4] rounded w-full" />

      <div className="space-y-2 py-2 border-y border-[#b39a78]/50">
        <div className="flex justify-between">
          <div className="h-4 bg-[#d9c6a4] rounded w-16" />
          <div className="h-4 bg-[#d9c6a4] rounded w-24" />
        </div>
        <div className="flex justify-between">
          <div className="h-4 bg-[#d9c6a4] rounded w-12" />
          <div className="h-4 bg-[#d9c6a4] rounded w-20" />
        </div>
      </div>

      <div className="flex justify-between items-center">
        <div className="h-4 bg-[#d9c6a4] rounded w-12" />
        <div className="h-9 bg-[#d9c6a4] rounded w-24" />
      </div>
    </div>
  );
}
