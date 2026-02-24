import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("validateEnv", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env["PORT"];
    delete process.env["API_KEYS"];
    delete process.env["ALLOWED_ORIGINS"];
    delete process.env["DATABASE_URL"];
    delete process.env["NODE_ENV"];
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  async function getValidator() {
    const mod = await import("./env.js");
    return mod.validateEnv;
  }

  it("returns defaults when no env vars set", async () => {
    const validateEnv = await getValidator();
    const config = validateEnv();
    expect(config.port).toBe(3001);
    expect(config.apiKeys).toEqual([]);
    expect(config.allowedOrigins).toEqual(["http://localhost:3000"]);
    expect(config.nodeEnv).toBe("development");
  });

  it("parses PORT correctly", async () => {
    process.env["PORT"] = "8080";
    const validateEnv = await getValidator();
    expect(validateEnv().port).toBe(8080);
  });

  it("throws on invalid PORT (NaN)", async () => {
    process.env["PORT"] = "not-a-number";
    const validateEnv = await getValidator();
    expect(() => validateEnv()).toThrow("Invalid PORT");
  });

  it("throws on PORT out of range (0)", async () => {
    process.env["PORT"] = "0";
    const validateEnv = await getValidator();
    expect(() => validateEnv()).toThrow("Invalid PORT");
  });

  it("throws on PORT out of range (99999)", async () => {
    process.env["PORT"] = "99999";
    const validateEnv = await getValidator();
    expect(() => validateEnv()).toThrow("Invalid PORT");
  });

  it("parses API_KEYS into array", async () => {
    process.env["API_KEYS"] = "key-a, key-b, key-c";
    const validateEnv = await getValidator();
    expect(validateEnv().apiKeys).toEqual(["key-a", "key-b", "key-c"]);
  });

  it("filters empty API_KEYS entries", async () => {
    process.env["API_KEYS"] = "key-a,,,key-b";
    const validateEnv = await getValidator();
    expect(validateEnv().apiKeys).toEqual(["key-a", "key-b"]);
  });

  it("parses ALLOWED_ORIGINS", async () => {
    process.env["ALLOWED_ORIGINS"] = "https://app.example.com, https://admin.example.com";
    const validateEnv = await getValidator();
    expect(validateEnv().allowedOrigins).toEqual([
      "https://app.example.com",
      "https://admin.example.com",
    ]);
  });

  it("warns in production with no API_KEYS", async () => {
    process.env["NODE_ENV"] = "production";
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const validateEnv = await getValidator();
    validateEnv();
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("No API_KEYS configured"));
    spy.mockRestore();
  });

  it("warns when DATABASE_URL is not set", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const validateEnv = await getValidator();
    validateEnv();
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("No DATABASE_URL"));
    spy.mockRestore();
  });
});
