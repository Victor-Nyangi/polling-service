function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse motion-reduce:animate-none rounded-2xl bg-border/60 ${className}`}
    />
  );
}

/**
 * Route-level loading fallback. Mirrors the general shape of a page (header
 * block, then one or more card blocks) without needing the data a page
 * would otherwise fetch. Used by each route's `loading.tsx`.
 */
export function PageSkeleton({ cardCount = 2 }: { cardCount?: number }) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8 lg:px-10">
      <SkeletonBlock className="h-32 w-full" />
      <div className="grid gap-4">
        {Array.from({ length: cardCount }).map((_, index) => (
          <SkeletonBlock key={index} className="h-28 w-full" />
        ))}
      </div>
    </div>
  );
}
