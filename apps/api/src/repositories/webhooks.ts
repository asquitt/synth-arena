import { sql } from "../db.js";

/**
 * Webhook repository — PostgreSQL-backed webhook storage.
 *
 * Stores webhook configurations and delivery logs.
 * Falls back to in-memory when DATABASE_URL is not set.
 */

export interface WebhookRecord {
  id: string;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookDeliveryRecord {
  id: string;
  webhookId: string;
  event: string;
  payload: Record<string, unknown>;
  statusCode: number | null;
  responseBody: string | null;
  error: string | null;
  durationMs: number | null;
  deliveredAt: string;
}

/** Create a new webhook. */
export async function create(opts: {
  url: string;
  secret: string;
  events: string[];
}): Promise<WebhookRecord> {
  const rows = await sql`
    INSERT INTO webhooks (url, secret, events)
    VALUES (${opts.url}, ${opts.secret}, ${JSON.stringify(opts.events)}::jsonb)
    RETURNING id, url, secret, events, active, created_at, updated_at
  `;
  return mapRow(rows[0]!);
}

/** List all active webhooks. */
export async function listActive(): Promise<WebhookRecord[]> {
  const rows = await sql`
    SELECT id, url, secret, events, active, created_at, updated_at
    FROM webhooks
    WHERE active = true
    ORDER BY created_at DESC
  `;
  return rows.map(mapRow);
}

/** List all webhooks (including inactive). */
export async function listAll(): Promise<WebhookRecord[]> {
  const rows = await sql`
    SELECT id, url, secret, events, active, created_at, updated_at
    FROM webhooks
    ORDER BY created_at DESC
  `;
  return rows.map(mapRow);
}

/** Get a webhook by ID. */
export async function findById(id: string): Promise<WebhookRecord | null> {
  const rows = await sql`
    SELECT id, url, secret, events, active, created_at, updated_at
    FROM webhooks
    WHERE id = ${id}
  `;
  return rows.length > 0 ? mapRow(rows[0]!) : null;
}

/** Soft-delete a webhook. */
export async function deactivate(id: string): Promise<boolean> {
  const result = await sql`
    UPDATE webhooks SET active = false, updated_at = NOW()
    WHERE id = ${id} AND active = true
  `;
  return result.count > 0;
}

/** Log a webhook delivery attempt. */
export async function logDelivery(opts: {
  webhookId: string;
  event: string;
  payload: Record<string, unknown>;
  statusCode: number | null;
  responseBody: string | null;
  error: string | null;
  durationMs: number | null;
}): Promise<void> {
  await sql`
    INSERT INTO webhook_deliveries (webhook_id, event, payload, status_code, response_body, error, duration_ms)
    VALUES (
      ${opts.webhookId},
      ${opts.event},
      ${JSON.stringify(opts.payload)}::jsonb,
      ${opts.statusCode},
      ${opts.responseBody},
      ${opts.error},
      ${opts.durationMs}
    )
  `;
}

/** Get recent deliveries for a webhook. */
export async function getDeliveries(
  webhookId: string,
  limit = 50,
): Promise<WebhookDeliveryRecord[]> {
  const rows = await sql`
    SELECT id, webhook_id, event, payload, status_code, response_body, error, duration_ms, delivered_at
    FROM webhook_deliveries
    WHERE webhook_id = ${webhookId}
    ORDER BY delivered_at DESC
    LIMIT ${limit}
  `;
  return rows.map((row) => ({
    id: row["id"] as string,
    webhookId: row["webhook_id"] as string,
    event: row["event"] as string,
    payload: row["payload"] as Record<string, unknown>,
    statusCode: row["status_code"] as number | null,
    responseBody: row["response_body"] as string | null,
    error: row["error"] as string | null,
    durationMs: row["duration_ms"] as number | null,
    deliveredAt: (row["delivered_at"] as Date).toISOString(),
  }));
}

function mapRow(row: Record<string, unknown>): WebhookRecord {
  return {
    id: row["id"] as string,
    url: row["url"] as string,
    secret: row["secret"] as string,
    events: row["events"] as string[],
    active: row["active"] as boolean,
    createdAt: (row["created_at"] as Date).toISOString(),
    updatedAt: (row["updated_at"] as Date).toISOString(),
  };
}
