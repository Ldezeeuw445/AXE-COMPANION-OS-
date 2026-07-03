type MetricBucket = {
  values: number[];
  count: number;
};

const buckets = new Map<string, MetricBucket>();
const MAX_VALUES = 240;

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[idx] ?? 0;
}

export function recordLatencySample(metric: string, valueMs: number): void {
  const safe = Number.isFinite(valueMs) ? Math.max(0, valueMs) : 0;
  const bucket = buckets.get(metric) ?? { values: [], count: 0 };
  bucket.count += 1;
  bucket.values.push(safe);
  if (bucket.values.length > MAX_VALUES) {
    bucket.values.splice(0, bucket.values.length - MAX_VALUES);
  }
  buckets.set(metric, bucket);
}

export function logLatencyIfDue(metric: string, every = 20): void {
  const bucket = buckets.get(metric);
  if (!bucket || bucket.count === 0) return;
  if (bucket.count % Math.max(1, every) !== 0) return;

  const sorted = [...bucket.values].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const avg = sorted.length ? sum / sorted.length : 0;
  const p50 = percentile(sorted, 50);
  const p95 = percentile(sorted, 95);
  const p99 = percentile(sorted, 99);
  const n = sorted.length;

  console.log(
    `[Perf] ${metric} n=${n} total=${bucket.count} avg=${avg.toFixed(1)}ms p50=${p50.toFixed(1)}ms p95=${p95.toFixed(1)}ms p99=${p99.toFixed(1)}ms`,
  );
}
