import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { timeout } from "./timeout.js";
import { ApiError } from "../errors.js";

describe("timeout middleware", () => {
  it("allows requests that complete within timeout", async () => {
    const app = new Hono();
    app.use("*", timeout(5000));
    app.get("/test", (c) => c.json({ ok: true }));

    const res = await app.fetch(new Request("http://localhost/test"));
    expect(res.status).toBe(200);
  });

  it("aborts requests that exceed timeout", async () => {
    const app = new Hono();
    app.use("*", timeout(50));
    app.get("/slow", async (c) => {
      await new Promise((r) => setTimeout(r, 200));
      return c.json({ ok: true });
    });

    // The timeout middleware throws ApiError which Hono should convert to a response
    // We need an error handler to catch it
    app.onError((err, c) => {
      if (err instanceof ApiError) {
        return c.json(err.toJSON(), err.statusCode as 504);
      }
      return c.json({ error: err.message }, 500);
    });

    const res = await app.fetch(new Request("http://localhost/slow"));
    expect(res.status).toBe(504);
    const body = await res.json() as { error: { message: string } };
    expect(body.error.message).toContain("timed out");
  });

  it("uses custom timeout value", async () => {
    const app = new Hono();
    app.use("*", timeout(100));
    app.get("/test", async (c) => {
      await new Promise((r) => setTimeout(r, 200));
      return c.json({ ok: true });
    });

    app.onError((err, c) => {
      if (err instanceof ApiError) {
        return c.json(err.toJSON(), err.statusCode as 504);
      }
      return c.json({ error: err.message }, 500);
    });

    const res = await app.fetch(new Request("http://localhost/test"));
    expect(res.status).toBe(504);
    const body = await res.json() as { error: { message: string } };
    expect(body.error.message).toContain("100ms");
  });
});
