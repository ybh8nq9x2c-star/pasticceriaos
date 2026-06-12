export default function PortalLoading() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-7 w-48 rounded-xl bg-surface-offset" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-24 rounded-2xl bg-surface-offset" />
      ))}
    </div>
  );
}
