/**
 * Environment variable validation.
 *
 * Validates required and optional env vars at startup.
 * Fails fast with clear error messages.
 */

interface EnvConfig {
  port: number;
  apiKeys: string[];
  allowedOrigins: string[];
  nodeEnv: string;
}

export function validateEnv(): EnvConfig {
  const nodeEnv = process.env["NODE_ENV"] ?? "development";
  const port = parseInt(process.env["PORT"] ?? "3001", 10);

  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${process.env["PORT"]}. Must be 1-65535.`);
  }

  const apiKeys = process.env["API_KEYS"]
    ? process.env["API_KEYS"].split(",").map((k) => k.trim()).filter(Boolean)
    : [];

  if (nodeEnv === "production" && apiKeys.length === 0) {
    console.warn("WARNING: No API_KEYS configured in production. API is unauthenticated.");
  }

  const allowedOrigins = process.env["ALLOWED_ORIGINS"]
    ? process.env["ALLOWED_ORIGINS"].split(",").map((o) => o.trim()).filter(Boolean)
    : ["http://localhost:3000"];

  return { port, apiKeys, allowedOrigins, nodeEnv };
}
