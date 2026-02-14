import postgres from "postgres";

/**
 * PostgreSQL connection pool for SynthArena API.
 *
 * Uses the `postgres` driver (porsager/postgres) for type-safe,
 * high-performance queries with automatic connection pooling.
 */

const DATABASE_URL = process.env["DATABASE_URL"] ?? "postgresql://syntharena:syntharena@localhost:5432/syntharena";

export const sql = postgres(DATABASE_URL, {
  max: 20,
  idle_timeout: 20,
  connect_timeout: 10,
  transform: { undefined: null },
});

/** Verify database connectivity. Returns latency in ms or throws. */
export async function checkDatabase(): Promise<number> {
  const start = Date.now();
  await sql`SELECT 1`;
  return Date.now() - start;
}

/** Gracefully close all connections. */
export async function closeDatabase(): Promise<void> {
  await sql.end();
}
