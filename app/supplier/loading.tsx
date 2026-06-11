export default function SupplierLoading() {
  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6 animate-pulse">
      <div className="h-8 w-64 rounded-xl bg-[#E5DDD0]" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl bg-[#EDE7DB]" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-14 rounded-xl bg-[#F0EBE1]" />
        ))}
      </div>
    </div>
  );
}
