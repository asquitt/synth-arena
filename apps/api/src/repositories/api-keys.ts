import { createHash } from "node:crypto";
import { sql } from "../db.js";

/**
 * API key repository — database-backed key management.
 *
 * Keys are stored as SHA-256 hashes. The raw key is never persisted.
 * Supports per-key permissions and rate limits.
 */

export interface ApiKeyRecord {
  id: string;
  keyHash: string;
  name: string | null;
  permissions: string[];
  rateLimitPerMinute: number;
  isActive: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

export function hashKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

/** Look up an API key by its hash. Returns null if not found or inactive. */
export async function findByHash(keyHash: string): Promise<ApiKeyRecord | null> {
  const rows = await sql`
    SELECT id, key_hash, name, permissions, rate_limit_per_minute, is_active, created_at, last_used_at
    FROM api_keys
    WHERE key_hash = ${keyHash} AND is_active = true
  `;
  if (rows.length === 0) return null;

  const row = rows[0]!;
  return {
    id: row["id"] as string,
    keyHash: row["key_hash"] as string,
    name: row["name"] as string | null,
    permissions: row["permissions"] as string[],
    rateLimitPerMinute: row["rate_limit_per_minute"] as number,
    isActive: row["is_active"] as boolean,
    createdAt: (row["created_at"] as Date).toISOString(),
    lastUsedAt: row["last_used_at"] ? (row["last_used_at"] as Date).toISOString() : null,
  };
}

/** Update last_used_at timestamp for a key. Fire-and-forget. */
export async function touchKey(keyHash: string): Promise<void> {
  await sql`UPDATE api_keys SET last_used_at = NOW() WHERE key_hash = ${keyHash}`;
}

/** Create a new API key. Returns the raw key (only time it's available). */
export async function createKey(opts: {
  name?: string;
  permissions?: string[];
  rateLimitPerMinute?: number;
}): Promise<{ id: string; rawKey: string }> {
  const rawKey = `sa_${generateSecureToken()}`;
  const keyHash = hashKey(rawKey);
  const permissions = JSON.stringify(opts.permissions ?? ["read", "write"]);
  const rateLimitPerMinute = opts.rateLimitPerMinute ?? 60;

  const rows = await sql`
    INSERT INTO api_keys (key_hash, name, permissions, rate_limit_per_minute)
    VALUES (${keyHash}, ${opts.name ?? null}, ${permissions}::jsonb, ${rateLimitPerMinute})
    RETURNING id
  `;

  return { id: rows[0]!["id"] as string, rawKey };
}

/** List all API keys (without hashes). */
export async function listKeys(): Promise<Array<Omit<ApiKeyRecord, "keyHash">>> {
  const rows = await sql`
    SELECT id, name, permissions, rate_limit_per_minute, is_active, created_at, last_used_at
    FROM api_keys
    ORDER BY created_at DESC
  `;
  return rows.map((row) => ({
    id: row["id"] as string,
    name: row["name"] as string | null,
    permissions: row["permissions"] as string[],
    rateLimitPerMinute: row["rate_limit_per_minute"] as number,
    isActive: row["is_active"] as boolean,
    createdAt: (row["created_at"] as Date).toISOString(),
    lastUsedAt: row["last_used_at"] ? (row["last_used_at"] as Date).toISOString() : null,
  }));
}

/** Revoke (soft-delete) an API key. */
export async function revokeKey(id: string): Promise<boolean> {
  const result = await sql`
    UPDATE api_keys SET is_active = false WHERE id = ${id} AND is_active = true
  `;
  return result.count > 0;
}

function generateSecureToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
