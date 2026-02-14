import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { createApiKeySchema, createWebhookSchema } from "../schemas.js";
import * as apiKeyRepo from "../repositories/api-keys.js";
import * as webhooks from "../webhooks.js";

/**
 * Admin routes for API key management.
 *
 * Requires "admin" permission on the calling API key.
 * In dev mode (no DATABASE_URL), returns 503.
 */

const useDb = !!process.env["DATABASE_URL"];

export const adminRoutes = new Hono();

adminRoutes.post("/keys",
  zValidator("json", createApiKeySchema, (result, c) => {
    if (!result.success) {
      return c.json({ error: "Validation failed", details: result.error.issues }, 400);
    }
  }),
  async (c) => {
    if (!useDb) {
      return c.json({ error: "API key management requires DATABASE_URL" }, 503);
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
    return c.json({ error: "API key management requires DATABASE_URL" }, 503);
  }

  const keys = await apiKeyRepo.listKeys();
  return c.json({ data: keys, metadata: { total: keys.length } });
});

adminRoutes.delete("/keys/:id", async (c) => {
  if (!useDb) {
    return c.json({ error: "API key management requires DATABASE_URL" }, 503);
  }

  const id = c.req.param("id");
  const revoked = await apiKeyRepo.revokeKey(id);
  if (!revoked) return c.json({ error: "Key not found or already revoked" }, 404);
  return c.json({ data: { revoked: true, id } });
});

// ─── Webhook Management ───────────────────────────────────────────

adminRoutes.post("/webhooks",
  zValidator("json", createWebhookSchema, (result, c) => {
    if (!result.success) {
      return c.json({ error: "Validation failed", details: result.error.issues }, 400);
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
  if (!deleted) return c.json({ error: "Webhook not found" }, 404);
  return c.json({ data: { deleted: true, id } });
});
