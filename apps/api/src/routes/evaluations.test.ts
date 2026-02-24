import { describe, it, expect } from "vitest";
import { app } from "../index.js";

/**
 * Evaluation route tests — verifies CRUD, validation, and edge cases.
 *
 * Uses in-memory store (no DATABASE_URL set in test).
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

describe("Evaluation routes", () => {
  describe("GET /api/v1/evaluations", () => {
    it("returns a list with metadata", async () => {
      const res = await request("/api/v1/evaluations");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toBeDefined();
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.metadata).toBeDefined();
      expect(body.metadata.total).toBeDefined();
      expect(body.metadata.limit).toBeDefined();
      expect(body.metadata.offset).toBeDefined();
    });

    it("respects limit parameter", async () => {
      const res = await request("/api/v1/evaluations?limit=5");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.metadata.limit).toBe(5);
    });

    it("caps limit at 200", async () => {
      const res = await request("/api/v1/evaluations?limit=9999");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.metadata.limit).toBe(200);
    });

    it("respects offset parameter", async () => {
      const res = await request("/api/v1/evaluations?offset=10");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.metadata.offset).toBe(10);
    });
  });

  describe("GET /api/v1/evaluations/:id", () => {
    it("returns 404 for non-existent evaluation", async () => {
      const res = await request("/api/v1/evaluations/does-not-exist");
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe("NOT_FOUND");
    });
  });

  describe("POST /api/v1/evaluations", () => {
    it("rejects request with missing required fields", async () => {
      const res = await request("/api/v1/evaluations", json({}));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects request with invalid domain", async () => {
      const res = await request(
        "/api/v1/evaluations",
        json({ name: "test", domain: 12345 }),
      );
      expect(res.status).toBe(400);
    });

    it("creates an evaluation with valid input", async () => {
      const res = await request(
        "/api/v1/evaluations",
        json({
          name: "test-eval",
          domain: "web-scraping",
          scenarioCount: 3,
          trials: 1,
        }),
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data).toBeDefined();
      expect(body.data.id).toBeDefined();
      expect(body.data.name).toBe("test-eval");
      expect(body.data.status).toBe("completed");
    });

    it("created evaluation can be retrieved by ID", async () => {
      const createRes = await request(
        "/api/v1/evaluations",
        json({
          name: "test-retrieve",
          domain: "web-scraping",
          scenarioCount: 2,
          trials: 1,
        }),
      );
      const { data: created } = await createRes.json();

      const getRes = await request(`/api/v1/evaluations/${created.id}`);
      expect(getRes.status).toBe(200);
      const { data: retrieved } = await getRes.json();
      expect(retrieved.id).toBe(created.id);
      expect(retrieved.name).toBe("test-retrieve");
    });
  });

  describe("DELETE /api/v1/evaluations/:id", () => {
    it("deletes an existing evaluation", async () => {
      const createRes = await request(
        "/api/v1/evaluations",
        json({
          name: "test-delete",
          domain: "web-scraping",
          scenarioCount: 2,
          trials: 1,
        }),
      );
      const { data: created } = await createRes.json();

      const delRes = await request(`/api/v1/evaluations/${created.id}`, {
        method: "DELETE",
      });
      expect(delRes.status).toBe(200);
      const body = await delRes.json();
      expect(body.data.deleted).toBe(true);

      // Should be gone now
      const getRes = await request(`/api/v1/evaluations/${created.id}`);
      expect(getRes.status).toBe(404);
    });

    it("returns 404 when deleting non-existent evaluation", async () => {
      const res = await request("/api/v1/evaluations/fake-id", {
        method: "DELETE",
      });
      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/v1/evaluations/:id/compliance", () => {
    it("returns 404 for non-existent evaluation", async () => {
      const res = await request("/api/v1/evaluations/missing-id/compliance");
      expect(res.status).toBe(404);
    });

    it("generates compliance report for completed evaluation", async () => {
      const createRes = await request(
        "/api/v1/evaluations",
        json({
          name: "compliance-test",
          domain: "web-scraping",
          scenarioCount: 3,
          trials: 1,
        }),
      );
      const { data: run } = await createRes.json();

      const res = await request(`/api/v1/evaluations/${run.id}/compliance`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toBeDefined();
    });
  });

  describe("POST /api/v1/evaluations/async", () => {
    it("returns 503 when Redis is not configured", async () => {
      const res = await request(
        "/api/v1/evaluations/async",
        json({
          name: "async-test",
          domain: "web-scraping",
          scenarioCount: 5,
        }),
      );
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.error.code).toBe("SERVICE_UNAVAILABLE");
    });
  });

  describe("GET /api/v1/evaluations/jobs/:jobId", () => {
    it("returns 503 when Redis is not configured", async () => {
      const res = await request("/api/v1/evaluations/jobs/some-job-id");
      expect(res.status).toBe(503);
    });
  });

  describe("POST /api/v1/evaluations/:id/red-team", () => {
    it("returns 404 for non-existent evaluation", async () => {
      const res = await request("/api/v1/evaluations/missing-id/red-team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/v1/evaluations/:id/state-diff", () => {
    it("returns 404 for non-existent evaluation", async () => {
      const res = await request("/api/v1/evaluations/missing-id/state-diff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenarioId: "s1",
          before: { state: { x: 1 } },
          after: { state: { x: 2 } },
        }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/v1/evaluations/:id/compare", () => {
    it("returns 404 for non-existent evaluation", async () => {
      const res = await request("/api/v1/evaluations/missing-id/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baselineId: "other-id" }),
      });
      expect(res.status).toBe(404);
    });
  });
});
