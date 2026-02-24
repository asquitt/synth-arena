import { describe, it, expect } from "vitest";
import { app } from "../index.js";

function request(path: string) {
  return app.fetch(new Request(`http://localhost${path}`));
}

describe("Red Team Presets routes", () => {
  describe("GET /api/v1/red-team/presets", () => {
    it("returns list of presets", async () => {
      const res = await request("/api/v1/red-team/presets");
      expect(res.status).toBe(200);
      const body = await res.json() as { data: Array<{ id: string; name: string }>; metadata: { total: number } };
      expect(body.data).toBeInstanceOf(Array);
      expect(body.metadata.total).toBe(body.data.length);
      if (body.data.length > 0) {
        expect(body.data[0]).toHaveProperty("id");
        expect(body.data[0]).toHaveProperty("name");
        expect(body.data[0]).toHaveProperty("framework");
        expect(body.data[0]).toHaveProperty("categoryCount");
      }
    });
  });

  describe("GET /api/v1/red-team/presets/:presetId", () => {
    it("returns preset details for valid ID", async () => {
      // First get the list to find a valid ID
      const listRes = await request("/api/v1/red-team/presets");
      const listBody = await listRes.json() as { data: Array<{ id: string }> };
      if (listBody.data.length === 0) return; // skip if no presets

      const presetId = listBody.data[0]!.id;
      const res = await request(`/api/v1/red-team/presets/${presetId}`);
      expect(res.status).toBe(200);
      const body = await res.json() as { data: { id: string; categories: unknown[] } };
      expect(body.data.id).toBe(presetId);
      expect(body.data.categories).toBeInstanceOf(Array);
    });

    it("returns 404 for invalid preset ID", async () => {
      const res = await request("/api/v1/red-team/presets/nonexistent");
      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/v1/red-team/presets/:presetId/patterns", () => {
    it("returns attack patterns for valid preset", async () => {
      const listRes = await request("/api/v1/red-team/presets");
      const listBody = await listRes.json() as { data: Array<{ id: string }> };
      if (listBody.data.length === 0) return;

      const presetId = listBody.data[0]!.id;
      const res = await request(`/api/v1/red-team/presets/${presetId}/patterns`);
      expect(res.status).toBe(200);
      const body = await res.json() as { data: unknown[]; metadata: { total: number; presetId: string } };
      expect(body.data).toBeInstanceOf(Array);
      expect(body.metadata.presetId).toBe(presetId);
    });

    it("returns 404 for nonexistent preset patterns", async () => {
      const res = await request("/api/v1/red-team/presets/nonexistent/patterns");
      expect(res.status).toBe(404);
    });
  });
});
