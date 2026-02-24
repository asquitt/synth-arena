import { describe, it, expect } from "vitest";
import { app } from "../index.js";

function request(path: string, init?: RequestInit) {
  return app.fetch(new Request(`http://localhost${path}`, init));
}

describe("Scorer Generator routes", () => {
  describe("POST /api/v1/scorers/generate", () => {
    it("generates a deterministic scorer and returns test result", async () => {
      const res = await request("/api/v1/scorers/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          criteria: "Output must contain the word 'hello'",
          name: "hello-check",
        }),
      });
      expect(res.status).toBe(201);
      const body = await res.json() as {
        data: { name: string; testResult: { score: number; passed: boolean } };
      };
      expect(body.data.name).toBe("hello-check");
      expect(body.data.testResult).toHaveProperty("score");
      expect(body.data.testResult).toHaveProperty("passed");
    });

    it("rejects empty criteria", async () => {
      const res = await request("/api/v1/scorers/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ criteria: "", name: "test" }),
      });
      expect(res.status).toBe(400);
    });

    it("rejects empty name", async () => {
      const res = await request("/api/v1/scorers/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ criteria: "check something", name: "" }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/v1/scorers/generate-suite", () => {
    it("generates multiple scorers", async () => {
      const res = await request("/api/v1/scorers/generate-suite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scorers: [
            { criteria: "Must contain JSON", name: "json-check" },
            { criteria: "Must be longer than 10 characters", name: "length-check" },
          ],
        }),
      });
      expect(res.status).toBe(201);
      const body = await res.json() as { data: { scorers: unknown[]; total: number } };
      expect(body.data.total).toBe(2);
      expect(body.data.scorers).toHaveLength(2);
    });

    it("rejects empty scorers array", async () => {
      const res = await request("/api/v1/scorers/generate-suite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scorers: [] }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/v1/scorers/test", () => {
    it("tests a scorer against custom input/output", async () => {
      const res = await request("/api/v1/scorers/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          criteria: "Output must contain 'hello'",
          name: "greeting-check",
          testInput: { query: "say hello" },
          testOutput: "hello world",
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json() as { data: { name: string; score: number; passed: boolean } };
      expect(body.data.name).toBe("greeting-check");
      expect(typeof body.data.score).toBe("number");
      expect(typeof body.data.passed).toBe("boolean");
    });
  });
});
