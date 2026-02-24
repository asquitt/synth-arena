import { describe, it, expect, beforeEach, vi } from "vitest";

describe("metrics", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  async function getMetrics() {
    return import("./metrics.js");
  }

  it("incCounter increments by 1 by default", async () => {
    const m = await getMetrics();
    m.incCounter("test_counter", { method: "GET" });
    m.incCounter("test_counter", { method: "GET" });
    const output = m.renderMetrics();
    expect(output).toContain('test_counter{method="GET"} 2');
  });

  it("incCounter increments by custom value", async () => {
    const m = await getMetrics();
    m.incCounter("batch_counter", { type: "eval" }, 5);
    const output = m.renderMetrics();
    expect(output).toContain('batch_counter{type="eval"} 5');
  });

  it("observeHistogram tracks sum and count", async () => {
    const m = await getMetrics();
    m.observeHistogram("request_duration", { method: "POST" }, 100);
    m.observeHistogram("request_duration", { method: "POST" }, 200);
    const output = m.renderMetrics();
    expect(output).toContain('request_duration_count{method="POST"} 2');
    expect(output).toContain('request_duration_sum{method="POST"} 300.00');
  });

  it("observeHistogram fills bucket counts", async () => {
    const m = await getMetrics();
    m.observeHistogram("latency", { route: "/test" }, 50);
    const output = m.renderMetrics();
    // 50ms should be in the 50, 100, 250, ... buckets
    expect(output).toContain('latency_bucket{route="/test",le="50"} 1');
    expect(output).toContain('latency_bucket{route="/test",le="100"} 1');
    // But not in the 5, 10, 25 buckets
    expect(output).toContain('latency_bucket{route="/test",le="25"} 0');
  });

  it("trackHttpRequest records counter and histogram", async () => {
    const m = await getMetrics();
    m.trackHttpRequest("GET", "/api/v1/evaluations", 200, 42);
    const output = m.renderMetrics();
    expect(output).toContain("syntharena_http_requests_total");
    expect(output).toContain("syntharena_http_request_duration_ms");
  });

  it("trackHttpRequest records error counter for 5xx", async () => {
    const m = await getMetrics();
    m.trackHttpRequest("POST", "/api/v1/evaluations", 500, 100);
    const output = m.renderMetrics();
    expect(output).toContain("syntharena_http_errors_total");
  });

  it("trackEvaluation records eval metrics", async () => {
    const m = await getMetrics();
    m.trackEvaluation("web-scraping", "completed", 5000, 50);
    const output = m.renderMetrics();
    expect(output).toContain("syntharena_evaluations_total");
    expect(output).toContain("syntharena_evaluation_duration_ms");
    expect(output).toContain("syntharena_scenarios_evaluated_total");
  });

  it("renderMetrics includes process uptime", async () => {
    const m = await getMetrics();
    const output = m.renderMetrics();
    expect(output).toContain("syntharena_process_uptime_seconds");
  });

  it("renderMetrics includes heap memory", async () => {
    const m = await getMetrics();
    const output = m.renderMetrics();
    expect(output).toContain("syntharena_process_heap_bytes");
    expect(output).toContain('type="used"');
    expect(output).toContain('type="total"');
    expect(output).toContain('type="rss"');
  });

  it("trackHttpRequest normalizes evaluation paths", async () => {
    const m = await getMetrics();
    m.trackHttpRequest("GET", "/api/v1/evaluations/abc-123", 200, 50);
    const output = m.renderMetrics();
    expect(output).toContain(":id");
    expect(output).not.toContain("abc-123");
  });
});
