import { describe, it, expect } from "vitest";
import { app } from "../index.js";

/**
 * Evaluation edge case tests — boundary conditions, concurrent requests,
 * large payloads, and error handling paths.
 */

function request(path: string, init?: RequestInit) {
  return app.fetch(new Request(`http://localhost${path}`, init));
}

function json(data: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  };
}

describe("Evaluation edge cases", () => {
  describe("parameter boundary conditions", () => {
    it("handles NaN limit gracefully", async () => {
      const res = await request("/api/v1/evaluations?limit=abc");
      expect(res.status).toBe(200);
      const body = await res.json();
      // Should fall back to default 50
      expect(body.metadata.limit).toBe(50);
    });

    it("handles negative offset gracefully", async () => {
      const res = await request("/api/v1/evaluations?offset=-10");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.metadata.offset).toBe(0);
    });

    it("handles zero limit (falls back to default)", async () => {
      const res = await request("/api/v1/evaluations?limit=0");
      expect(res.status).toBe(200);
      const body = await res.json();
      // 0 is falsy, so || 50 kicks in, then Math.max clamps to 1 minimum
      // Actual: Math.min(Math.max(0 || 50, 1), 200) = 50
      expect(body.metadata.limit).toBe(50);
    });

    it("filters by domain", async () => {
      const res = await request("/api/v1/evaluations?domain=web-scraping");
      expect(res.status).toBe(200);
    });

    it("filters by status", async () => {
      const res = await request("/api/v1/evaluations?status=completed");
      expect(res.status).toBe(200);
    });

    it("filters by both domain and status", async () => {
      const res = await request("/api/v1/evaluations?domain=web-scraping&status=completed");
      expect(res.status).toBe(200);
    });
  });

  describe("create evaluation edge cases", () => {
    it("rejects empty name", async () => {
      const res = await request(
        "/api/v1/evaluations",
        json({ name: "", domain: "web-scraping" }),
      );
      expect(res.status).toBe(400);
    });

    it("handles minimum scenario count", async () => {
      const res = await request(
        "/api/v1/evaluations",
        json({ name: "min-test", domain: "web-scraping", scenarioCount: 1, trials: 1 }),
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.results.length).toBeGreaterThanOrEqual(1);
    });

    it("handles optional parameters with defaults", async () => {
      const res = await request(
        "/api/v1/evaluations",
        json({ name: "defaults-test", domain: "web-scraping" }),
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.name).toBe("defaults-test");
    });

    it("rejects scenario count of 0", async () => {
      const res = await request(
        "/api/v1/evaluations",
        json({ name: "zero-scenarios", domain: "web-scraping", scenarioCount: 0 }),
      );
      expect(res.status).toBe(400);
    });

    it("rejects trials of 0", async () => {
      const res = await request(
        "/api/v1/evaluations",
        json({ name: "zero-trials", domain: "web-scraping", trials: 0 }),
      );
      expect(res.status).toBe(400);
    });

    it("rejects non-string name", async () => {
      const res = await request(
        "/api/v1/evaluations",
        json({ name: 12345, domain: "web-scraping" }),
      );
      expect(res.status).toBe(400);
    });
  });

  describe("concurrent operations", () => {
    it("handles concurrent creates", async () => {
      const promises = Array.from({ length: 5 }, (_, i) =>
        request(
          "/api/v1/evaluations",
          json({ name: `concurrent-${i}`, domain: "web-scraping", scenarioCount: 2, trials: 1 }),
        ),
      );

      const results = await Promise.all(promises);
      for (const res of results) {
        expect(res.status).toBe(201);
      }

      // All should have unique IDs
      const bodies = await Promise.all(results.map((r) => r.json()));
      const ids = new Set(bodies.map((b) => b.data.id));
      expect(ids.size).toBe(5);
    });

    it("handles concurrent reads", async () => {
      const promises = Array.from({ length: 10 }, () =>
        request("/api/v1/evaluations"),
      );

      const results = await Promise.all(promises);
      for (const res of results) {
        expect(res.status).toBe(200);
      }
    });
  });

  describe("state-diff edge cases", () => {
    it("rejects missing scenarioId", async () => {
      // First create an evaluation
      const createRes = await request(
        "/api/v1/evaluations",
        json({ name: "diff-test", domain: "web-scraping", scenarioCount: 2, trials: 1 }),
      );
      const { data: run } = await createRes.json();

      const res = await request(`/api/v1/evaluations/${run.id}/state-diff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          before: { state: { x: 1 } },
          after: { state: { x: 2 } },
        }),
      });
      expect(res.status).toBe(400);
    });

    it("handles state diff with expectedKeys", async () => {
      const createRes = await request(
        "/api/v1/evaluations",
        json({ name: "diff-keys", domain: "web-scraping", scenarioCount: 2, trials: 1 }),
      );
      const { data: run } = await createRes.json();

      const res = await request(`/api/v1/evaluations/${run.id}/state-diff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenarioId: "s1",
          before: { state: { count: 0, status: "pending" } },
          after: { state: { count: 1, status: "done" } },
          expectedKeys: ["count"],
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toBeDefined();
    });
  });

  describe("evaluation lifecycle", () => {
    it("full CRUD lifecycle", async () => {
      // Create
      const createRes = await request(
        "/api/v1/evaluations",
        json({ name: "lifecycle-test", domain: "web-scraping", scenarioCount: 3, trials: 1 }),
      );
      expect(createRes.status).toBe(201);
      const { data: created } = await createRes.json();
      const id = created.id;

      // Read
      const getRes = await request(`/api/v1/evaluations/${id}`);
      expect(getRes.status).toBe(200);
      const { data: retrieved } = await getRes.json();
      expect(retrieved.id).toBe(id);
      expect(retrieved.status).toBe("completed");
      expect(retrieved.results).toBeDefined();
      expect(retrieved.summary).toBeDefined();

      // List (should include this one)
      const listRes = await request("/api/v1/evaluations");
      const { data: list } = await listRes.json();
      expect(list.some((r: { id: string }) => r.id === id)).toBe(true);

      // Delete
      const delRes = await request(`/api/v1/evaluations/${id}`, { method: "DELETE" });
      expect(delRes.status).toBe(200);

      // Verify gone
      const goneRes = await request(`/api/v1/evaluations/${id}`);
      expect(goneRes.status).toBe(404);
    });
  });

  describe("evaluation summary shape", () => {
    it("summary contains required metrics", async () => {
      const createRes = await request(
        "/api/v1/evaluations",
        json({ name: "summary-test", domain: "web-scraping", scenarioCount: 5, trials: 2 }),
      );
      const { data: run } = await createRes.json();

      expect(run.summary).toBeDefined();
      expect(typeof run.summary.totalScenarios).toBe("number");
      expect(typeof run.summary.totalTrials).toBe("number");
      expect(typeof run.summary.overallPassRate).toBe("number");
      expect(typeof run.summary.passAtK).toBe("number");
      expect(typeof run.summary.passToTheK).toBe("number");
      expect(typeof run.summary.totalCost).toBe("number");
      expect(typeof run.summary.totalDuration).toBe("number");
      expect(run.summary.overallPassRate).toBeGreaterThanOrEqual(0);
      expect(run.summary.overallPassRate).toBeLessThanOrEqual(1);
    });

    it("scenario results contain required fields", async () => {
      const createRes = await request(
        "/api/v1/evaluations",
        json({ name: "results-test", domain: "web-scraping", scenarioCount: 3, trials: 1 }),
      );
      const { data: run } = await createRes.json();

      for (const result of run.results) {
        expect(result.scenarioId).toBeDefined();
        expect(typeof result.passAtK).toBe("number");
        expect(typeof result.passToTheK).toBe("number");
        expect(result.trials).toBeDefined();
        expect(Array.isArray(result.trials)).toBe(true);
      }
    });
  });
});
