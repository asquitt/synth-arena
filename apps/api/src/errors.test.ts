import { describe, it, expect } from "vitest";
import {
  ApiError,
  validationError,
  notFound,
  unauthorized,
  forbidden,
  rateLimited,
  domainNotFound,
  serviceUnavailable,
} from "./errors.js";

describe("ApiError", () => {
  it("has correct properties", () => {
    const err = new ApiError("VALIDATION_ERROR", "bad input", 400, { field: "name" });
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.message).toBe("bad input");
    expect(err.statusCode).toBe(400);
    expect(err.details).toEqual({ field: "name" });
    expect(err.name).toBe("ApiError");
  });

  it("defaults statusCode to 500", () => {
    const err = new ApiError("INTERNAL_ERROR", "oops");
    expect(err.statusCode).toBe(500);
  });

  it("serializes to JSON correctly", () => {
    const err = new ApiError("NOT_FOUND", "gone", 404);
    expect(err.toJSON()).toEqual({
      error: { code: "NOT_FOUND", message: "gone" },
    });
  });

  it("includes details in JSON when present", () => {
    const err = new ApiError("VALIDATION_ERROR", "bad", 400, { field: "email" });
    expect(err.toJSON()).toEqual({
      error: { code: "VALIDATION_ERROR", message: "bad", details: { field: "email" } },
    });
  });

  it("omits details from JSON when absent", () => {
    const err = new ApiError("INTERNAL_ERROR", "boom", 500);
    const json = err.toJSON();
    expect(json.error).not.toHaveProperty("details");
  });

  it("is an instance of Error", () => {
    const err = new ApiError("INTERNAL_ERROR", "test");
    expect(err).toBeInstanceOf(Error);
  });
});

describe("factory helpers", () => {
  it("validationError creates 400 with code", () => {
    const err = validationError("field missing", { field: "name" });
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.statusCode).toBe(400);
    expect(err.details).toEqual({ field: "name" });
  });

  it("notFound creates 404 with resource name", () => {
    const err = notFound("Evaluation", "abc-123");
    expect(err.code).toBe("NOT_FOUND");
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe("Evaluation 'abc-123' not found");
  });

  it("notFound works without id", () => {
    const err = notFound("Scenario");
    expect(err.message).toBe("Scenario not found");
  });

  it("unauthorized creates 401", () => {
    const err = unauthorized("bad token");
    expect(err.code).toBe("UNAUTHORIZED");
    expect(err.statusCode).toBe(401);
  });

  it("unauthorized uses default message", () => {
    const err = unauthorized();
    expect(err.message).toBe("Missing or invalid API key");
  });

  it("forbidden creates 403", () => {
    const err = forbidden("no access");
    expect(err.code).toBe("FORBIDDEN");
    expect(err.statusCode).toBe(403);
  });

  it("rateLimited creates 429 with retryAfter", () => {
    const err = rateLimited(30);
    expect(err.code).toBe("RATE_LIMITED");
    expect(err.statusCode).toBe(429);
    expect(err.details).toEqual({ retryAfter: 30 });
  });

  it("rateLimited without retryAfter has no details", () => {
    const err = rateLimited();
    expect(err.details).toBeUndefined();
  });

  it("domainNotFound creates 404 for domain", () => {
    const err = domainNotFound("healthcare");
    expect(err.code).toBe("DOMAIN_NOT_FOUND");
    expect(err.message).toContain("healthcare");
  });

  it("serviceUnavailable creates 503", () => {
    const err = serviceUnavailable("Redis");
    expect(err.code).toBe("SERVICE_UNAVAILABLE");
    expect(err.statusCode).toBe(503);
    expect(err.message).toContain("Redis");
  });
});
