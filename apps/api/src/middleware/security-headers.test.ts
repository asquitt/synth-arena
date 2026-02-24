import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { securityHeaders } from "./security-headers.js";

describe("securityHeaders middleware", () => {
  const originalEnv = process.env["NODE_ENV"];

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env["NODE_ENV"] = originalEnv;
    } else {
      delete process.env["NODE_ENV"];
    }
  });

  function buildApp() {
    const app = new Hono();
    app.use("*", securityHeaders);
    app.get("/test", (c) => c.json({ ok: true }));
    return app;
  }

  it("sets X-Content-Type-Options to nosniff", async () => {
    const res = await buildApp().fetch(new Request("http://localhost/test"));
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("sets X-Frame-Options to DENY", async () => {
    const res = await buildApp().fetch(new Request("http://localhost/test"));
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("disables X-XSS-Protection (legacy header)", async () => {
    const res = await buildApp().fetch(new Request("http://localhost/test"));
    expect(res.headers.get("X-XSS-Protection")).toBe("0");
  });

  it("sets Referrer-Policy", async () => {
    const res = await buildApp().fetch(new Request("http://localhost/test"));
    expect(res.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  it("sets Permissions-Policy to deny camera, mic, geo", async () => {
    const res = await buildApp().fetch(new Request("http://localhost/test"));
    expect(res.headers.get("Permissions-Policy")).toBe("camera=(), microphone=(), geolocation=()");
  });

  it("sets HSTS in production", async () => {
    process.env["NODE_ENV"] = "production";
    const res = await buildApp().fetch(new Request("http://localhost/test"));
    expect(res.headers.get("Strict-Transport-Security")).toBe("max-age=31536000; includeSubDomains");
  });

  it("does not set HSTS in development", async () => {
    process.env["NODE_ENV"] = "development";
    const res = await buildApp().fetch(new Request("http://localhost/test"));
    expect(res.headers.get("Strict-Transport-Security")).toBeNull();
  });
});
