import { describe, it, expect } from "vitest";
import { app } from "../index.js";

/**
 * Admin route tests — API key management and webhook management.
 *
 * Without DATABASE_URL, key endpoints return 503.
 * Webhook endpoints use in-memory store.
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

describe("Admin routes", () => {
  describe("API key management", () => {
    describe("POST /api/v1/admin/keys", () => {
      it("returns 503 when PostgreSQL is not configured", async () => {
        const res = await request(
          "/api/v1/admin/keys",
          json({ name: "test-key" }),
        );
        expect(res.status).toBe(503);
        const body = await res.json();
        expect(body.error.code).toBe("SERVICE_UNAVAILABLE");
        expect(body.error.message).toContain("PostgreSQL");
      });

      it("rejects invalid request body", async () => {
        const res = await request(
          "/api/v1/admin/keys",
          json({ name: 12345, permissions: "not-an-array" }),
        );
        expect(res.status).toBe(400);
      });
    });

    describe("GET /api/v1/admin/keys", () => {
      it("returns 503 when PostgreSQL is not configured", async () => {
        const res = await request("/api/v1/admin/keys");
        expect(res.status).toBe(503);
      });
    });

    describe("DELETE /api/v1/admin/keys/:id", () => {
      it("returns 503 when PostgreSQL is not configured", async () => {
        const res = await request("/api/v1/admin/keys/some-key-id", {
          method: "DELETE",
        });
        expect(res.status).toBe(503);
      });
    });
  });

  describe("Webhook management", () => {
    describe("POST /api/v1/admin/webhooks", () => {
      it("creates a webhook", async () => {
        const res = await request(
          "/api/v1/admin/webhooks",
          json({
            url: "https://example.com/webhook",
            events: ["evaluation.completed"],
          }),
        );
        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.data.id).toBeDefined();
        expect(body.data.secret).toBeDefined();
      });

      it("rejects webhook with missing URL", async () => {
        const res = await request(
          "/api/v1/admin/webhooks",
          json({ events: ["evaluation.completed"] }),
        );
        expect(res.status).toBe(400);
      });

      it("rejects webhook with missing events", async () => {
        const res = await request(
          "/api/v1/admin/webhooks",
          json({ url: "https://example.com/webhook" }),
        );
        expect(res.status).toBe(400);
      });
    });

    describe("GET /api/v1/admin/webhooks", () => {
      it("returns a list of webhooks", async () => {
        const res = await request("/api/v1/admin/webhooks");
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.data).toBeDefined();
        expect(Array.isArray(body.data)).toBe(true);
        expect(body.metadata.total).toBeDefined();
      });
    });

    describe("DELETE /api/v1/admin/webhooks/:id", () => {
      it("deletes an existing webhook", async () => {
        // Create first
        const createRes = await request(
          "/api/v1/admin/webhooks",
          json({
            url: "https://example.com/to-delete",
            events: ["evaluation.completed"],
          }),
        );
        const { data: created } = await createRes.json();

        // Delete
        const delRes = await request(`/api/v1/admin/webhooks/${created.id}`, {
          method: "DELETE",
        });
        expect(delRes.status).toBe(200);
        const body = await delRes.json();
        expect(body.data.deleted).toBe(true);
      });

      it("returns 404 for non-existent webhook", async () => {
        const res = await request("/api/v1/admin/webhooks/fake-id", {
          method: "DELETE",
        });
        expect(res.status).toBe(404);
      });
    });
  });
});
