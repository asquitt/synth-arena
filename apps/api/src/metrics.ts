/**
 * Lightweight Prometheus metrics for SynthArena API.
 *
 * No external dependencies — tracks counters and histograms in memory,
 * exposes them in Prometheus text exposition format at /metrics.
 */

interface Counter {
  labels: Record<string, string>;
  value: number;
}

interface HistogramBucket {
  le: number;
  count: number;
}

interface Histogram {
  labels: Record<string, string>;
  buckets: HistogramBucket[];
  sum: number;
  count: number;
}

const counters = new Map<string, Counter[]>();
const histograms = new Map<string, Histogram[]>();

const startTime = Date.now();

// Default HTTP latency buckets (in ms)
const HTTP_BUCKETS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

function getOrCreateCounter(name: string, labels: Record<string, string>): Counter {
  if (!counters.has(name)) counters.set(name, []);
  const list = counters.get(name)!;
  const key = JSON.stringify(labels);
  let existing = list.find((c) => JSON.stringify(c.labels) === key);
  if (!existing) {
    existing = { labels, value: 0 };
    list.push(existing);
  }
  return existing;
}

function getOrCreateHistogram(name: string, labels: Record<string, string>, buckets: number[] = HTTP_BUCKETS): Histogram {
  if (!histograms.has(name)) histograms.set(name, []);
  const list = histograms.get(name)!;
  const key = JSON.stringify(labels);
  let existing = list.find((h) => JSON.stringify(h.labels) === key);
  if (!existing) {
    existing = {
      labels,
      buckets: buckets.map((le) => ({ le, count: 0 })),
      sum: 0,
      count: 0,
    };
    list.push(existing);
  }
  return existing;
}

// ─── Public API ─────────────────────────────────────────

export function incCounter(name: string, labels: Record<string, string>, value = 1) {
  getOrCreateCounter(name, labels).value += value;
}

export function observeHistogram(name: string, labels: Record<string, string>, value: number) {
  const h = getOrCreateHistogram(name, labels);
  h.sum += value;
  h.count++;
  for (const bucket of h.buckets) {
    if (value <= bucket.le) bucket.count++;
  }
}

export function trackHttpRequest(method: string, path: string, status: number, durationMs: number) {
  // Normalize path to avoid cardinality explosion
  const route = normalizePath(path);
  incCounter("http_requests_total", { method, route, status: String(status) });
  observeHistogram("http_request_duration_ms", { method, route }, durationMs);
  if (status >= 500) {
    incCounter("http_errors_total", { method, route, status: String(status) });
  }
}

export function trackEvaluation(domain: string, status: "completed" | "failed", durationMs: number, scenarioCount: number) {
  incCounter("evaluations_total", { domain, status });
  observeHistogram("evaluation_duration_ms", { domain }, durationMs);
  incCounter("scenarios_evaluated_total", { domain }, scenarioCount);
}

// ─── Exposition ─────────────────────────────────────────

function formatLabels(labels: Record<string, string>): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) return "";
  return `{${entries.map(([k, v]) => `${k}="${v}"`).join(",")}}`;
}

export function renderMetrics(): string {
  const lines: string[] = [];

  // Process uptime
  lines.push("# HELP process_uptime_seconds Time since API started");
  lines.push("# TYPE process_uptime_seconds gauge");
  lines.push(`process_uptime_seconds ${((Date.now() - startTime) / 1000).toFixed(1)}`);
  lines.push("");

  // Memory
  const mem = process.memoryUsage();
  lines.push("# HELP process_heap_bytes Heap memory usage in bytes");
  lines.push("# TYPE process_heap_bytes gauge");
  lines.push(`process_heap_bytes{type="used"} ${mem.heapUsed}`);
  lines.push(`process_heap_bytes{type="total"} ${mem.heapTotal}`);
  lines.push(`process_heap_bytes{type="rss"} ${mem.rss}`);
  lines.push("");

  // Counters
  for (const [name, list] of counters) {
    lines.push(`# TYPE ${name} counter`);
    for (const c of list) {
      lines.push(`${name}${formatLabels(c.labels)} ${c.value}`);
    }
    lines.push("");
  }

  // Histograms
  for (const [name, list] of histograms) {
    lines.push(`# TYPE ${name} histogram`);
    for (const h of list) {
      const lblStr = formatLabels(h.labels);
      for (const bucket of h.buckets) {
        const bucketLabels = { ...h.labels, le: String(bucket.le) };
        lines.push(`${name}_bucket${formatLabels(bucketLabels)} ${bucket.count}`);
      }
      const infLabels = { ...h.labels, le: "+Inf" };
      lines.push(`${name}_bucket${formatLabels(infLabels)} ${h.count}`);
      lines.push(`${name}_sum${lblStr} ${h.sum.toFixed(2)}`);
      lines.push(`${name}_count${lblStr} ${h.count}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ─── Helpers ──────────────────────────────────────────

/** Normalize dynamic path segments to avoid cardinality explosion. */
function normalizePath(path: string): string {
  return path
    .replace(/\/api\/v1\/evaluations\/[^/]+\/compare/, "/api/v1/evaluations/:id/compare")
    .replace(/\/api\/v1\/evaluations\/jobs\/[^/]+/, "/api/v1/evaluations/jobs/:jobId")
    .replace(/\/api\/v1\/evaluations\/[^/]+/, "/api/v1/evaluations/:id")
    .replace(/\/api\/v1\/traces\/[^/]+/, "/api/v1/traces/:runId");
}
