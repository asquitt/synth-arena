import { readdir, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

/**
 * Lightweight SQL migration runner.
 *
 * - Reads numbered .sql files from migrations/ directory
 * - Tracks applied migrations in a `_migrations` table
 * - Runs pending migrations in order within a transaction
 * - No ORM, no dependencies beyond `postgres`
 *
 * Usage: npx tsx src/migrate.ts
 */

const DATABASE_URL = process.env["DATABASE_URL"] ?? "postgresql://syntharena:syntharena@localhost:5432/syntharena";
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, "migrations");

async function migrate() {
  const sql = postgres(DATABASE_URL, { max: 1 });

  try {
    // Ensure migrations tracking table exists
    await sql`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    // Get already-applied migrations
    const applied = await sql<{ name: string }[]>`SELECT name FROM _migrations ORDER BY id`;
    const appliedSet = new Set(applied.map((r) => r.name));

    // Read migration files
    const files = (await readdir(MIGRATIONS_DIR).catch(() => []))
      .filter((f) => f.endsWith(".sql"))
      .sort();

    const pending = files.filter((f) => !appliedSet.has(f));

    if (pending.length === 0) {
      console.log("No pending migrations.");
      return;
    }

    console.log(`${pending.length} pending migration(s):`);

    for (const file of pending) {
      const filePath = join(MIGRATIONS_DIR, file);
      const content = await readFile(filePath, "utf-8");

      console.log(`  Applying: ${file}`);
      await sql.begin(async (_tx) => {
        const tx = _tx as unknown as typeof sql;
        // Execute the migration SQL (using unsafe since it's a trusted file)
        await tx.unsafe(content);
        // Record it
        await tx`INSERT INTO _migrations (name) VALUES (${file})`;
      });
      console.log(`  Applied:  ${file}`);
    }

    console.log(`Done. ${pending.length} migration(s) applied.`);
  } finally {
    await sql.end();
  }
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
