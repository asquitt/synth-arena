/**
 * Structured API error types with machine-readable error codes.
 *
 * Error codes follow the pattern: CATEGORY_SPECIFIC_ERROR
 * Clients can switch on `code` for programmatic error handling.
 */

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "ALREADY_EXISTS"
  | "RATE_LIMITED"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "QUOTA_EXCEEDED"
  | "DOMAIN_NOT_FOUND"
  | "EVALUATION_FAILED"
  | "JOB_NOT_FOUND"
  | "JOB_DEAD"
  | "WEBHOOK_DELIVERY_FAILED"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_ERROR";

export class ApiError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly statusCode: number = 500,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details ? { details: this.details } : {}),
      },
    };
  }
}

// ─── Factory helpers ─────────────────────────────────────────

export function validationError(message: string, details?: Record<string, unknown>) {
  return new ApiError("VALIDATION_ERROR", message, 400, details);
}

export function notFound(resource: string, id?: string) {
  const msg = id ? `${resource} '${id}' not found` : `${resource} not found`;
  return new ApiError("NOT_FOUND", msg, 404);
}

export function unauthorized(message = "Missing or invalid API key") {
  return new ApiError("UNAUTHORIZED", message, 401);
}

export function forbidden(message = "Insufficient permissions") {
  return new ApiError("FORBIDDEN", message, 403);
}

export function rateLimited(retryAfter?: number) {
  return new ApiError("RATE_LIMITED", "Rate limit exceeded", 429, retryAfter ? { retryAfter } : undefined);
}

export function domainNotFound(domain: string) {
  return new ApiError("DOMAIN_NOT_FOUND", `Domain '${domain}' not found`, 404);
}

export function serviceUnavailable(service: string) {
  return new ApiError("SERVICE_UNAVAILABLE", `${service} is not configured or unavailable`, 503);
}
