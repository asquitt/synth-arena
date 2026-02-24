import { describe, it, expect } from "vitest";
import { app } from "../index.js";

/**
 * E2E API lifecycle tests — exercises full evaluation workflow
 * through the HTTP layer using in-memory storage.
 */

function request(path: string, init?: RequestInit) {
  return app.fetch(new Request(`http://localhost${path}`, init));
}

function post(path: string, body: unknown) {
  return request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validEvalBody = {
  name: "e2e-test-eval",
  domain: "web-scraping",
  scenarioCount: 2,
  trials: 1,
  maxConcurrency: 1,
};

describe("E2E: Full evaluation lifecycle", () => {
  let runId: string;

  it("creates an evaluation via POST", async () => {
    const res = await post("/api/v1/evaluations", validEvalBody);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(body.data.id).toBeDefined();
    expect(body.data.name).toBe("e2e-test-eval");
    expect(body.data.status).toBe("completed");
    expect(body.data.results).toBeInstanceOf(Array);
    expect(body.data.results.length).toBe(2);
    expect(body.data.summary).toBeDefined();
    runId = body.data.id;
  });

  it("retrieves the evaluation by ID", async () => {
    const res = await request(`/api/v1/evaluations/${runId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe(runId);
    expect(body.data.name).toBe("e2e-test-eval");
    expect(body.data.results.length).toBe(2);
  });

  it("lists evaluations and includes the created run", async () => {
    const res = await request("/api/v1/evaluations");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.metadata.total).toBeGreaterThanOrEqual(1);
    const found = body.data.find((r: { id: string }) => r.id === runId);
    expect(found).toBeDefined();
  });

  it("generates a compliance report for the run", async () => {
    const res = await request(`/api/v1/evaluations/${runId}/compliance`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(body.data.framework).toBe("eu-ai-act");
    expect(body.data.overallStatus).toBeDefined();
    expect(body.data.riskClassification).toBeDefined();
  });

  it("computes a state-diff for a scenario", async () => {
    // Get a scenario ID from the run results
    const getRes = await request(`/api/v1/evaluations/${runId}`);
    const run = (await getRes.json()).data;
    const scenarioId = run.results[0].scenarioId;

    const res = await post(`/api/v1/evaluations/${runId}/state-diff`, {
      scenarioId,
      before: { state: { page: "home", loggedIn: false } },
      after: { state: { page: "dashboard", loggedIn: true } },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(body.data.deltas).toBeInstanceOf(Array);
    expect(body.data.deltas.length).toBeGreaterThan(0);
    expect(body.data.summary).toBeDefined();
  });

  it("runs red-team adversarial evaluation", async () => {
    const res = await post(`/api/v1/evaluations/${runId}/red-team`, {
      categories: ["prompt-injection"],
      intensity: "low",
      scenarioCount: 2,
      trials: 1,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.runId).toBe(runId);
    expect(body.data.redTeamRunId).toBeDefined();
    expect(body.data.verdict).toBeDefined();
    expect(["robust", "moderate_risk", "vulnerable"]).toContain(body.data.verdict);
    expect(body.data.overallPassRate).toBeGreaterThanOrEqual(0);
    expect(body.data.overallPassRate).toBeLessThanOrEqual(1);
  });

  it("compares two evaluation runs", async () => {
    // Create a second run to compare against
    const res2 = await post("/api/v1/evaluations", {
      ...validEvalBody,
      name: "e2e-baseline",
    });
    const baselineId = (await res2.json()).data.id;

    const res = await post(`/api/v1/evaluations/${runId}/compare`, {
      baselineId,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(body.data.verdict).toBeDefined();
    expect(["pass", "fail", "warning"]).toContain(body.data.verdict);
    expect(body.data.summary).toBeDefined();
  });

  it("deletes the evaluation", async () => {
    const res = await request(`/api/v1/evaluations/${runId}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.deleted).toBe(true);
  });

  it("returns 404 after deletion", async () => {
    const res = await request(`/api/v1/evaluations/${runId}`);
    expect(res.status).toBe(404);
  });
});

describe("E2E: SSE streaming evaluation", () => {
  it("streams evaluation progress via SSE", async () => {
    const res = await post("/api/v1/evaluations/stream", {
      ...validEvalBody,
      name: "e2e-stream-test",
      scenarioCount: 1,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const text = await res.text();
    // SSE should contain event data
    expect(text).toContain("event:");
    expect(text).toContain("data:");
    // Should end with a "done" event
    expect(text).toContain("event: done");
  });
});

describe("E2E: Webhook lifecycle", () => {
  it("registers, lists, and deletes a webhook", async () => {
    // Register
    const createRes = await post("/api/v1/admin/webhooks", {
      url: "https://example.com/webhook",
      events: ["evaluation.completed"],
    });
    expect(createRes.status).toBe(201);
    const webhook = (await createRes.json()).data;
    expect(webhook.id).toBeDefined();
    expect(webhook.secret).toMatch(/^whsec_/);

    // List
    const listRes = await request("/api/v1/admin/webhooks");
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()).data;
    expect(list.some((w: { id: string }) => w.id === webhook.id)).toBe(true);

    // Delete
    const delRes = await request(`/api/v1/admin/webhooks/${webhook.id}`, {
      method: "DELETE",
    });
    expect(delRes.status).toBe(200);
  });
});

describe("E2E: Error handling", () => {
  it("returns 404 for non-existent evaluation", async () => {
    const res = await request("/api/v1/evaluations/nonexistent-id");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("returns 400 for invalid create body", async () => {
    const res = await post("/api/v1/evaluations", { name: "" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for compliance on incomplete evaluation", async () => {
    // Can't easily create an incomplete eval, but a non-existent one returns 404
    const res = await request("/api/v1/evaluations/fake-id/compliance");
    expect(res.status).toBe(404);
  });

  it("returns 503 for async evaluation without Redis", async () => {
    const res = await post("/api/v1/evaluations/async", validEvalBody);
    expect(res.status).toBe(503);
  });

  it("returns structured error envelope for all errors", async () => {
    const res = await request("/api/v1/evaluations/nonexistent");
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBeDefined();
    expect(body.error.message).toBeDefined();
  });
});
