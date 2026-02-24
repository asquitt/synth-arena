import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { cacheControl, noCache, shortCache } from "./cache.js";

describe("cache middleware", () => {
  it("cacheControl sets specified directive", async () => {
    const app = new Hono();
    app.use("*", cacheControl("public, max-age=60"));
    app.get("/test", (c) => c.json({ ok: true }));

    const res = await app.fetch(new Request("http://localhost/test"));
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=60");
  });

  it("does not overwrite existing Cache-Control header", async () => {
    const app = new Hono();
    app.use("*", cacheControl("public, max-age=60"));
    app.get("/test", (c) => {
      c.header("Cache-Control", "private");
      return c.json({ ok: true });
    });

    const res = await app.fetch(new Request("http://localhost/test"));
    expect(res.headers.get("Cache-Control")).toBe("private");
  });

  it("noCache sets no-store directive", async () => {
    const app = new Hono();
    app.use("*", noCache);
    app.get("/test", (c) => c.json({ ok: true }));

    const res = await app.fetch(new Request("http://localhost/test"));
    expect(res.headers.get("Cache-Control")).toBe("no-store, no-cache, must-revalidate");
  });

  it("shortCache sets 5s public cache", async () => {
    const app = new Hono();
    app.use("*", shortCache);
    app.get("/test", (c) => c.json({ ok: true }));

    const res = await app.fetch(new Request("http://localhost/test"));
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=5, s-maxage=5");
  });
});
