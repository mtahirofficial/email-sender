function Block({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-xl bg-mist ${className}`} />;
}

export function DashboardSkeleton() {
  return (
    <main aria-label="Loading dashboard" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-7 flex items-end justify-between gap-4"><div className="w-full max-w-lg space-y-3"><Block className="h-4 w-40" /><Block className="h-10 w-72" /><Block className="h-4 w-80" /></div><Block className="h-11 w-36" /></div>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Block key={i} className="h-32" />)}</div>
      <div className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]"><Block className="h-80" /><Block className="h-80" /></div>
    </main>
  );
}
