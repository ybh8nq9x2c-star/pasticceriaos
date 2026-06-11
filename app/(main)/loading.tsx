// =============================================================================
// app/(main)/loading.tsx
// Skeleton route-level: appare istantaneamente mentre i Server Components
// streammano i dati (Next App Router Suspense boundary automatico).
// =============================================================================

export default function MainLoading() {
  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-8 w-64 rounded-xl bg-[#E5DDD0]" />
        <div className="h-4 w-40 rounded-lg bg-[#EDE7DB]" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl bg-[#EDE7DB]" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-14 rounded-xl bg-[#F0EBE1]" />
        ))}
      </div>
    </div>
  );
}
