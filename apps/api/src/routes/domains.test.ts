import { describe, it, expect } from "vitest";
import { app } from "../index.js";

function request(path: string) {
  return app.fetch(new Request(`http://localhost${path}`));
}

describe("Domain routes", () => {
  describe("GET /api/v1/domains", () => {
    it("returns list of domains", async () => {
      const res = await request("/api/v1/domains");
      expect(res.status).toBe(200);
      const body = await res.json() as { data: unknown[]; metadata: { total: number } };
      expect(body.data).toBeInstanceOf(Array);
      expect(body.metadata).toHaveProperty("total");
      expect(body.metadata.total).toBe(body.data.length);
    });

    it("each domain has expected fields", async () => {
      const res = await request("/api/v1/domains");
      const body = await res.json() as {
        data: Array<{
          name: string;
          description: string;
          version: string;
          generators: number;
        }>;
      };
      if (body.data.length > 0) {
        const domain = body.data[0]!;
        expect(domain).toHaveProperty("name");
        expect(domain).toHaveProperty("description");
        expect(domain).toHaveProperty("version");
        expect(domain).toHaveProperty("generators");
      }
    });
  });

  describe("GET /api/v1/domains/:name", () => {
    it("returns domain details for valid name", async () => {
      // First get list to find a valid name
      const listRes = await request("/api/v1/domains");
      const listBody = await listRes.json() as { data: Array<{ name: string }> };
      if (listBody.data.length === 0) return;

      const name = listBody.data[0]!.name;
      const res = await request(`/api/v1/domains/${name}`);
      expect(res.status).toBe(200);
      const body = await res.json() as {
        data: { template: { name: string }; validation: { valid: boolean } };
      };
      expect(body.data.template.name).toBe(name);
      expect(body.data.validation).toHaveProperty("valid");
    });

    it("returns 404 for nonexistent domain", async () => {
      const res = await request("/api/v1/domains/nonexistent-domain-xyz");
      expect(res.status).toBe(404);
    });
  });
});
