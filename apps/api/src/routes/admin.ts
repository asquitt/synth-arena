import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { createApiKeySchema, createWebhookSchema } from "../schemas.js";
import * as apiKeyRepo from "../repositories/api-keys.js";
import * as webhooks from "../webhooks.js";
import { validationError, notFound, serviceUnavailable } from "../errors.js";

/**
 * Admin routes for API key management.
 *
 * Requires "admin" permission on the calling API key.
 * In dev mode (no DATABASE_URL), returns 503.
 */

const useDb = !!process.env["DATABASE_URL"];

export const adminRoutes = new Hono();

adminRoutes.post("/keys",
  zValidator("json", createApiKeySchema, (result) => {
    if (!result.success) {
      throw validationError("Request validation failed", { issues: result.error.issues });
    }
  }),
  async (c) => {
    if (!useDb) {
      throw serviceUnavailable("PostgreSQL (required for API key management)");
    }

    const body = c.req.valid("json");
    const { id, rawKey } = await apiKeyRepo.createKey({
      name: body.name,
      permissions: body.permissions,
      rateLimitPerMinute: body.rateLimitPerMinute,
    });

    return c.json({
      data: {
        id,
        key: rawKey,
        message: "Save this key securely. It cannot be retrieved again.",
      },
    }, 201);
  }
);

adminRoutes.get("/keys", async (c) => {
  if (!useDb) {
    throw serviceUnavailable("PostgreSQL (required for API key management)");
  }

  const keys = await apiKeyRepo.listKeys();
  return c.json({ data: keys, metadata: { total: keys.length } });
});

adminRoutes.delete("/keys/:id", async (c) => {
  if (!useDb) {
    throw serviceUnavailable("PostgreSQL (required for API key management)");
  }

  const id = c.req.param("id");
  const revoked = await apiKeyRepo.revokeKey(id);
  if (!revoked) throw notFound("API key", id);
  return c.json({ data: { revoked: true, id } });
});

// ─── Webhook Management ───────────────────────────────────────────

adminRoutes.post("/webhooks",
  zValidator("json", createWebhookSchema, (result) => {
    if (!result.success) {
      throw validationError("Request validation failed", { issues: result.error.issues });
    }
  }),
  async (c) => {
    const body = c.req.valid("json");
    const config = webhooks.registerWebhook(body.url, body.events);
    return c.json({
      data: {
        id: config.id,
        secret: config.secret,
        message: "Save the webhook secret. It is used to verify delivery signatures.",
      },
    }, 201);
  }
);

adminRoutes.get("/webhooks", async (c) => {
  const list = webhooks.listWebhooks();
  return c.json({ data: list, metadata: { total: list.length } });
});

adminRoutes.delete("/webhooks/:id", async (c) => {
  const id = c.req.param("id");
  const deleted = webhooks.deleteWebhook(id);
  if (!deleted) throw notFound("Webhook", id);
  return c.json({ data: { deleted: true, id } });
});
