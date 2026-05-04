export default function ChartLoading() {
  return (
    <div className="flex flex-1 flex-col gap-3 py-2">
      <div className="h-16 animate-pulse rounded-xl bg-white/[0.05]" />
      <div className="h-10 w-full max-w-md animate-pulse rounded-lg bg-white/[0.04]" />
      <div className="min-h-[280px] flex-1 animate-pulse rounded-xl bg-white/[0.04]" />
    </div>
  );
}
