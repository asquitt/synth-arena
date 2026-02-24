import { describe, it, expect, vi, beforeEach } from "vitest";
import { CircuitBreaker, CircuitBreakerError } from "./circuit-breaker.js";

describe("CircuitBreaker", () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    breaker = new CircuitBreaker({
      name: "test",
      failureThreshold: 3,
      cooldownMs: 100,
    });
  });

  it("starts in closed state", () => {
    expect(breaker.getState()).toEqual({ state: "closed", failures: 0 });
  });

  it("passes through successful calls", async () => {
    const result = await breaker.execute(async () => "ok");
    expect(result).toBe("ok");
    expect(breaker.getState().state).toBe("closed");
  });

  it("counts failures without opening before threshold", async () => {
    const fail = () => breaker.execute(async () => { throw new Error("fail"); });
    await expect(fail()).rejects.toThrow("fail");
    await expect(fail()).rejects.toThrow("fail");

    expect(breaker.getState().failures).toBe(2);
    expect(breaker.getState().state).toBe("closed");
  });

  it("opens after reaching failure threshold", async () => {
    const fail = () => breaker.execute(async () => { throw new Error("fail"); });
    await expect(fail()).rejects.toThrow();
    await expect(fail()).rejects.toThrow();
    await expect(fail()).rejects.toThrow();

    expect(breaker.getState().state).toBe("open");
  });

  it("fails fast when open", async () => {
    // Force open
    for (let i = 0; i < 3; i++) {
      await breaker.execute(async () => { throw new Error("fail"); }).catch(() => {});
    }

    await expect(breaker.execute(async () => "ok")).rejects.toBeInstanceOf(CircuitBreakerError);
  });

  it("transitions to half_open after cooldown", async () => {
    for (let i = 0; i < 3; i++) {
      await breaker.execute(async () => { throw new Error("fail"); }).catch(() => {});
    }

    // Wait for cooldown
    await new Promise((r) => setTimeout(r, 150));

    // Should report half_open
    expect(breaker.getState().state).toBe("half_open");
  });

  it("recovers from half_open on success", async () => {
    for (let i = 0; i < 3; i++) {
      await breaker.execute(async () => { throw new Error("fail"); }).catch(() => {});
    }

    await new Promise((r) => setTimeout(r, 150));

    // Successful call in half_open should close
    const result = await breaker.execute(async () => "recovered");
    expect(result).toBe("recovered");
    expect(breaker.getState().state).toBe("closed");
    expect(breaker.getState().failures).toBe(0);
  });

  it("re-opens from half_open on failure", async () => {
    for (let i = 0; i < 3; i++) {
      await breaker.execute(async () => { throw new Error("fail"); }).catch(() => {});
    }

    await new Promise((r) => setTimeout(r, 150));

    // Fail in half_open
    await expect(breaker.execute(async () => { throw new Error("still broken"); })).rejects.toThrow("still broken");
    // Failures increment, but need to check: 3 + 1 = 4, threshold = 3, so should be open again
    expect(breaker.getState().state).toBe("open");
  });

  it("resets to closed state", async () => {
    for (let i = 0; i < 3; i++) {
      await breaker.execute(async () => { throw new Error("fail"); }).catch(() => {});
    }
    expect(breaker.getState().state).toBe("open");

    breaker.reset();
    expect(breaker.getState()).toEqual({ state: "closed", failures: 0 });
  });

  it("resets failure count on success", async () => {
    await breaker.execute(async () => { throw new Error("fail"); }).catch(() => {});
    await breaker.execute(async () => { throw new Error("fail"); }).catch(() => {});

    // Now succeed
    await breaker.execute(async () => "ok");
    expect(breaker.getState().failures).toBe(0);
  });

  it("CircuitBreakerError has circuit name", async () => {
    for (let i = 0; i < 3; i++) {
      await breaker.execute(async () => { throw new Error("fail"); }).catch(() => {});
    }

    try {
      await breaker.execute(async () => "ok");
    } catch (err) {
      expect(err).toBeInstanceOf(CircuitBreakerError);
      expect((err as CircuitBreakerError).circuitName).toBe("test");
    }
  });
});
