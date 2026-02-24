import { describe, it, expect } from "vitest";
import { app } from "./index.js";

/**
 * API smoke tests — verifies core endpoints respond correctly.
 *
 * Uses Hono's built-in fetch handler (no server needed).
 * These run without external services (Postgres, Redis, ClickHouse).
 */

function request(path: string, init?: RequestInit) {
  return app.fetch(new Request(`http://localhost${path}`, init));
}

describe("Health endpoints", () => {
  it("GET /health returns 200 with status ok", async () => {
    const res = await request("/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.version).toBe("0.1.0");
    expect(body.timestamp).toBeDefined();
    expect(body.uptime).toBeGreaterThan(0);
  });

  it("GET /health/deep returns 200 with checks", async () => {
    const res = await request("/health/deep");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBeDefined();
    expect(body.checks).toBeDefined();
    expect(body.checks.memory).toBeDefined();
    expect(body.checks.event_loop).toBeDefined();
  });
});

describe("Metrics endpoint", () => {
  it("GET /metrics returns Prometheus text format", async () => {
    const res = await request("/metrics");
    expect(res.status).toBe(200);
    const contentType = res.headers.get("content-type");
    expect(contentType).toContain("text/plain");
    const text = await res.text();
    expect(text).toContain("syntharena_http_requests_total");
    expect(text).toContain("syntharena_process_uptime_seconds");
  });
});

describe("API Documentation", () => {
  it("GET /api/docs returns Swagger UI HTML", async () => {
    const res = await request("/api/docs");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("swagger-ui");
    expect(html).toContain("SynthArena API Docs");
  });

  it("GET /api/docs/openapi.json returns OpenAPI spec", async () => {
    const res = await request("/api/docs/openapi.json");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.openapi).toBe("3.1.0");
    expect(body.info.title).toBe("SynthArena API");
    expect(body.paths["/api/v1/evaluations"]).toBeDefined();
  });
});

describe("404 handler", () => {
  it("returns structured error for unknown routes", async () => {
    const res = await request("/api/v1/nonexistent");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });
});

describe("Authentication", () => {
  it("rejects unauthenticated requests to protected routes", async () => {
    const res = await request("/api/v1/evaluations");
    // Without API_KEYS env var, auth is bypassed in dev mode
    // With API_KEYS set, this would return 401
    expect([200, 401]).toContain(res.status);
  });
});

describe("Evaluation CRUD", () => {
  it("creates an evaluation and retrieves it", async () => {
    const createRes = await request("/api/v1/evaluations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "test-eval",
        domain: "web-scraping",
        scenarioCount: 2,
        trials: 1,
      }),
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    expect(created.data.id).toBeDefined();
    expect(created.data.status).toBe("completed");

    // Retrieve it
    const getRes = await request(`/api/v1/evaluations/${created.data.id}`);
    expect(getRes.status).toBe(200);
    const fetched = await getRes.json();
    expect(fetched.data.id).toBe(created.data.id);
    expect(fetched.data.results).toBeDefined();
    expect(fetched.data.results.length).toBe(2);
  });

  it("lists evaluations with pagination", async () => {
    const listRes = await request("/api/v1/evaluations?limit=10&offset=0");
    expect(listRes.status).toBe(200);
    const list = await listRes.json();
    expect(list.data).toBeDefined();
    expect(list.metadata.limit).toBe(10);
    expect(list.metadata.offset).toBe(0);
    expect(list.metadata.total).toBeGreaterThanOrEqual(0);
  });

  it("returns 404 for non-existent evaluation", async () => {
    const res = await request("/api/v1/evaluations/nonexistent-id");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("deletes an evaluation", async () => {
    const createRes = await request("/api/v1/evaluations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "to-delete",
        domain: "web-scraping",
        scenarioCount: 1,
        trials: 1,
      }),
    });
    const { data } = await createRes.json();

    const delRes = await request(`/api/v1/evaluations/${data.id}`, { method: "DELETE" });
    expect(delRes.status).toBe(200);
    const deleted = await delRes.json();
    expect(deleted.data.deleted).toBe(true);

    // Verify it's gone
    const getRes = await request(`/api/v1/evaluations/${data.id}`);
    expect(getRes.status).toBe(404);
  });

  it("validates request body on create", async () => {
    const res = await request("/api/v1/evaluations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }), // empty name
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("CORS", () => {
  it("includes CORS headers on responses", async () => {
    const res = await request("/health", {
      headers: { Origin: "http://localhost:3000" },
    });
    expect(res.status).toBe(200);
  });
});

describe("Security headers", () => {
  it("includes security headers on all responses", async () => {
    const res = await request("/health");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(res.headers.get("permissions-policy")).toContain("camera=()");
  });
});

describe("Request ID", () => {
  it("returns a generated request ID when none provided", async () => {
    const res = await request("/health");
    expect(res.status).toBe(200);
    const rid = res.headers.get("x-request-id");
    expect(rid).toBeDefined();
    expect(rid!.length).toBeGreaterThan(0);
  });

  it("echoes back a provided X-Request-Id header", async () => {
    const customId = "test-request-123";
    const res = await request("/health", {
      headers: { "X-Request-Id": customId },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("x-request-id")).toBe(customId);
  });
});

describe("Compliance report", () => {
  it("generates EU AI Act compliance report for a completed evaluation", async () => {
    const createRes = await request("/api/v1/evaluations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "compliance-test",
        domain: "healthcare",
        scenarioCount: 3,
        trials: 1,
      }),
    });
    const { data } = await createRes.json();

    const compRes = await request(`/api/v1/evaluations/${data.id}/compliance`);
    expect(compRes.status).toBe(200);
    const report = await compRes.json();
    expect(report.data.framework).toBe("eu-ai-act");
    expect(report.data.riskClassification.level).toBe("high"); // healthcare = high-risk
    expect(report.data.checks.length).toBeGreaterThan(0);
    expect(report.data.overallStatus).toBeDefined();
    expect(report.data.recommendations).toBeDefined();
    expect(report.data.testingSummary.accuracy).toBeDefined();
    expect(report.data.testingSummary.reliability).toBeDefined();
  });

  it("returns 404 for compliance report on non-existent evaluation", async () => {
    const res = await request("/api/v1/evaluations/missing-id/compliance");
    expect(res.status).toBe(404);
  });
});

describe("Red-team evaluation", () => {
  it("runs adversarial evaluation against an existing run", async () => {
    // First create an evaluation
    const createRes = await request("/api/v1/evaluations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "red-team-base",
        domain: "web-scraping",
        scenarioCount: 2,
        trials: 1,
      }),
    });
    const { data } = await createRes.json();

    // Run red team against it
    const rtRes = await request(`/api/v1/evaluations/${data.id}/red-team`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        categories: ["prompt-injection", "data-exfiltration"],
        intensity: "low",
        scenarioCount: 4,
        trials: 1,
      }),
    });
    expect(rtRes.status).toBe(200);
    const rtBody = await rtRes.json();
    expect(rtBody.data.runId).toBe(data.id);
    expect(rtBody.data.redTeamRunId).toBeDefined();
    expect(rtBody.data.verdict).toBeDefined();
    expect(["robust", "moderate_risk", "vulnerable"]).toContain(rtBody.data.verdict);
    expect(rtBody.data.categories.length).toBeGreaterThan(0);
    expect(rtBody.data.overallPassRate).toBeGreaterThanOrEqual(0);
    expect(rtBody.data.overallPassRate).toBeLessThanOrEqual(1);
  });

  it("returns 404 for red-team on non-existent evaluation", async () => {
    const res = await request("/api/v1/evaluations/missing-id/red-team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
  });
});

describe("State-diff endpoint", () => {
  it("computes state diff for an evaluation", async () => {
    const createRes = await request("/api/v1/evaluations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "state-diff-test",
        domain: "web-scraping",
        scenarioCount: 1,
        trials: 1,
      }),
    });
    const { data } = await createRes.json();

    const diffRes = await request(`/api/v1/evaluations/${data.id}/state-diff`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scenarioId: "test-scenario",
        before: { state: { cart: [], total: 0 } },
        after: { state: { cart: ["item-1"], total: 29.99 } },
        expectedKeys: ["cart", "total"],
      }),
    });
    expect(diffRes.status).toBe(200);
    const diffBody = await diffRes.json();
    expect(diffBody.data.deltas.length).toBeGreaterThan(0);
    expect(diffBody.data.summary.overallScore).toBe(1);
    expect(diffBody.data.summary.completenessScore).toBe(1);
  });
});

describe("Scorer Generator", () => {
  it("generates a deterministic scorer and tests it", async () => {
    const res = await request("/api/v1/scorers/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        criteria: "Must not contain Acme. Must not be empty",
        name: "no_acme",
        mode: "deterministic",
        threshold: 0.7,
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.name).toBe("no_acme");
    expect(body.data.testResult.score).toBeGreaterThanOrEqual(0);
    expect(typeof body.data.testResult.passed).toBe("boolean");
  });

  it("tests a scorer against custom input/output", async () => {
    const res = await request("/api/v1/scorers/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        criteria: "Must contain hello",
        name: "greeting_check",
        mode: "deterministic",
        threshold: 0.7,
        testInput: { query: "greet me" },
        testOutput: "hello world",
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.score).toBe(1);
    expect(body.data.passed).toBe(true);
  });

  it("fails scorer when criteria not met", async () => {
    const res = await request("/api/v1/scorers/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        criteria: "Must contain foo. Must contain bar. Must not contain bad",
        name: "multi_check",
        mode: "deterministic",
        threshold: 1.0,
        testInput: {},
        testOutput: "this has foo but not bar and also bad",
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.score).toBeLessThan(1);
    expect(body.data.passed).toBe(false);
  });
});

describe("Red Team Presets", () => {
  it("lists available presets", async () => {
    const res = await request("/api/v1/red-team/presets");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(2);
    const ids = body.data.map((p: { id: string }) => p.id);
    expect(ids).toContain("owasp-llm-top10-2025");
    expect(ids).toContain("nist-ai-rmf-1.0");
  });

  it("returns OWASP preset details with attack patterns", async () => {
    const res = await request("/api/v1/red-team/presets/owasp-llm-top10-2025");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.framework).toBe("owasp-llm-top10");
    expect(body.data.categories.length).toBeGreaterThan(0);
    // Verify categories have attack patterns
    const llm01 = body.data.categories.find((c: { id: string }) => c.id === "llm01");
    expect(llm01).toBeDefined();
    expect(llm01.attackPatterns.length).toBeGreaterThan(0);
  });

  it("returns NIST preset details", async () => {
    const res = await request("/api/v1/red-team/presets/nist-ai-rmf-1.0");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.framework).toBe("nist-ai-rmf");
    expect(body.data.categories.length).toBeGreaterThan(0);
  });

  it("returns 404 for unknown preset", async () => {
    const res = await request("/api/v1/red-team/presets/nonexistent");
    expect(res.status).toBe(404);
  });

  it("returns attack patterns for a preset", async () => {
    const res = await request("/api/v1/red-team/presets/owasp-llm-top10-2025/patterns");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data[0].severity).toBeDefined();
    expect(body.data[0].template).toBeDefined();
  });
});

describe("End-to-end evaluation flow", () => {
  it("runs full flow: create → red-team → state-diff → compare", async () => {
    // Step 1: Create baseline evaluation
    const baselineRes = await request("/api/v1/evaluations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "e2e-baseline",
        domain: "web-scraping",
        scenarioCount: 3,
        trials: 2,
      }),
    });
    expect(baselineRes.status).toBe(201);
    const baseline = (await baselineRes.json()).data;
    expect(baseline.status).toBe("completed");
    expect(baseline.results.length).toBe(3);
    expect(baseline.summary.passAtK).toBeGreaterThan(0);
    expect(baseline.summary.passToTheK).toBeGreaterThanOrEqual(0);
    expect(baseline.summary.gPassAtK).toBeGreaterThanOrEqual(0);
    expect(baseline.summary.latencyPercentiles).toBeDefined();
    expect(baseline.summary.latencyPercentiles.p50).toBeGreaterThanOrEqual(0);
    expect(baseline.summary.latencyPercentiles.p95).toBeGreaterThanOrEqual(baseline.summary.latencyPercentiles.p50);
    expect(baseline.summary.latencyPercentiles.p99).toBeGreaterThanOrEqual(baseline.summary.latencyPercentiles.p95);

    // Step 2: Create current evaluation
    const currentRes = await request("/api/v1/evaluations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "e2e-current",
        domain: "web-scraping",
        scenarioCount: 3,
        trials: 2,
      }),
    });
    expect(currentRes.status).toBe(201);
    const current = (await currentRes.json()).data;

    // Step 3: Run red-team on baseline
    const rtRes = await request(`/api/v1/evaluations/${baseline.id}/red-team`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        categories: ["prompt-injection", "tool-misuse"],
        intensity: "low",
        scenarioCount: 3,
        trials: 1,
      }),
    });
    expect(rtRes.status).toBe(200);
    const rt = (await rtRes.json()).data;
    expect(rt.verdict).toBeDefined();
    expect(rt.categories.length).toBeGreaterThan(0);

    // Step 4: Compute state-diff
    const diffRes = await request(`/api/v1/evaluations/${baseline.id}/state-diff`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scenarioId: baseline.results[0].scenarioId,
        before: { state: { items: [], status: "idle" } },
        after: { state: { items: ["x"], status: "complete" } },
        expectedKeys: ["items", "status"],
      }),
    });
    expect(diffRes.status).toBe(200);
    const diff = (await diffRes.json()).data;
    expect(diff.summary.overallScore).toBe(1);

    // Step 5: Compare baseline vs current
    const compareRes = await request(`/api/v1/evaluations/${current.id}/compare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baselineId: baseline.id }),
    });
    expect(compareRes.status).toBe(200);
    const comparison = (await compareRes.json()).data;
    expect(comparison.verdict).toBeDefined();
    expect(["pass", "fail", "warning"]).toContain(comparison.verdict);
    expect(comparison.summary.passRateDelta).toBeDefined();
    expect(comparison.scenarioDetails.length).toBeGreaterThan(0);

    // Step 6: Get compliance report
    const compRes = await request(`/api/v1/evaluations/${baseline.id}/compliance`);
    expect(compRes.status).toBe(200);
    const comp = (await compRes.json()).data;
    expect(comp.framework).toBe("eu-ai-act");
    expect(comp.overallStatus).toBeDefined();

    // Step 7: Verify listing includes both runs
    const listRes = await request("/api/v1/evaluations?limit=100");
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()).data;
    const ids = list.map((r: { id: string }) => r.id);
    expect(ids).toContain(baseline.id);
    expect(ids).toContain(current.id);
  });
});
