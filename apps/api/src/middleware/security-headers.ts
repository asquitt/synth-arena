import type { Context, Next } from "hono";

/**
 * Security headers middleware.
 *
 * Adds standard security headers to all responses to prevent
 * common web vulnerabilities (clickjacking, XSS, MIME sniffing).
 */

export async function securityHeaders(c: Context, next: Next) {
  await next();

  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("X-XSS-Protection", "0"); // Disabled in favor of CSP; legacy header can cause issues
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  // HSTS only in production (behind TLS terminator)
  if (process.env["NODE_ENV"] === "production") {
    c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
}
