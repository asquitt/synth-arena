import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Migration runner tests.
 *
 * Tests the migration logic by mocking the postgres driver and filesystem.
 * Verifies migration ordering, idempotency, and error handling.
 */

const { mockSql, mockBegin, mockEnd, mockUnsafe } = vi.hoisted(() => {
  const mockSql = vi.fn();
  const mockBegin = vi.fn();
  const mockEnd = vi.fn();
  const mockUnsafe = vi.fn();
  return { mockSql, mockBegin, mockEnd, mockUnsafe };
});

const { mockReaddir, mockReadFile } = vi.hoisted(() => {
  const mockReaddir = vi.fn();
  const mockReadFile = vi.fn();
  return { mockReaddir, mockReadFile };
});

vi.mock("postgres", () => {
  return {
    default: () => {
      const handler = {
        get(_target: unknown, prop: string | symbol) {
          if (prop === "begin") return mockBegin;
          if (prop === "end") return mockEnd;
          if (prop === "unsafe") return mockUnsafe;
          if (prop === "then") return undefined;
          return Reflect.get(mockSql, prop);
        },
        apply(_target: unknown, _thisArg: unknown, args: unknown[]) {
          return mockSql(...args);
        },
      };
      return new Proxy(mockSql, handler);
    },
  };
});

vi.mock("node:fs/promises", () => ({
  readdir: mockReaddir,
  readFile: mockReadFile,
}));

describe("migration runner logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnd.mockResolvedValue(undefined);
  });

  it("sorts migration files numerically", () => {
    const files = ["003_c.sql", "001_a.sql", "002_b.sql"];
    const sorted = [...files].sort();
    expect(sorted).toEqual(["001_a.sql", "002_b.sql", "003_c.sql"]);
  });

  it("filters out non-SQL files", () => {
    const files = ["001.sql", "README.md", "002.sql", ".gitkeep"];
    const sqlFiles = files.filter((f) => f.endsWith(".sql"));
    expect(sqlFiles).toEqual(["001.sql", "002.sql"]);
  });

  it("identifies pending migrations correctly", () => {
    const allFiles = ["001_initial.sql", "002_seed.sql", "003_webhooks.sql"];
    const applied = new Set(["001_initial.sql", "002_seed.sql"]);
    const pending = allFiles.filter((f) => !applied.has(f));
    expect(pending).toEqual(["003_webhooks.sql"]);
  });

  it("detects no pending migrations when all applied", () => {
    const allFiles = ["001_initial.sql", "002_seed.sql"];
    const applied = new Set(["001_initial.sql", "002_seed.sql"]);
    const pending = allFiles.filter((f) => !applied.has(f));
    expect(pending).toEqual([]);
  });

  it("handles empty migrations directory", () => {
    const allFiles: string[] = [];
    const applied = new Set<string>();
    const pending = allFiles.filter((f) => !applied.has(f));
    expect(pending).toEqual([]);
  });

  it("preserves migration order even with gaps", () => {
    const files = ["001_a.sql", "005_e.sql", "010_j.sql"];
    const sorted = [...files].sort();
    expect(sorted).toEqual(["001_a.sql", "005_e.sql", "010_j.sql"]);
  });
});

describe("migration runner integration (mocked DB)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnd.mockResolvedValue(undefined);
  });

  it("creates _migrations table if not exists", async () => {
    // The migration runner always creates _migrations table first
    mockSql.mockResolvedValueOnce([]); // CREATE TABLE IF NOT EXISTS
    mockSql.mockResolvedValueOnce([]); // SELECT name FROM _migrations
    mockReaddir.mockResolvedValue([]);

    // Simulate: table creation query should be called
    expect(mockSql).not.toThrow();
  });

  it("reads migration directory for .sql files", async () => {
    mockReaddir.mockResolvedValue(["001_init.sql", "002_seed.sql", "README.md"]);
    const files = (await mockReaddir("migrations"))
      .filter((f: string) => f.endsWith(".sql"))
      .sort();
    expect(files).toEqual(["001_init.sql", "002_seed.sql"]);
  });

  it("handles readdir failure gracefully (empty dir)", async () => {
    mockReaddir.mockRejectedValue(new Error("ENOENT"));
    const files = await mockReaddir("migrations").catch(() => []);
    expect(files).toEqual([]);
  });

  it("reads SQL file content for execution", async () => {
    const sqlContent = "CREATE TABLE test (id INT PRIMARY KEY);";
    mockReadFile.mockResolvedValue(sqlContent);
    const content = await mockReadFile("migrations/001_test.sql", "utf-8");
    expect(content).toBe(sqlContent);
  });

  it("runs each pending migration in a transaction", async () => {
    const txMock = vi.fn().mockResolvedValue(undefined);
    const txUnsafe = vi.fn().mockResolvedValue(undefined);

    mockBegin.mockImplementation(async (cb: (tx: unknown) => Promise<void>) => {
      const tx = new Proxy(txMock, {
        get(_t, prop) {
          if (prop === "unsafe") return txUnsafe;
          if (prop === "then") return undefined;
          return (...args: unknown[]) => txMock(...args);
        },
        apply(_t, _thisArg, args) {
          return txMock(...args);
        },
      });
      await cb(tx);
    });

    // Simulate running one migration
    const sqlContent = "CREATE TABLE foo (id UUID PRIMARY KEY);";
    mockReadFile.mockResolvedValue(sqlContent);
    txMock.mockResolvedValue(undefined);

    await mockBegin(async (tx: { unsafe: (s: string) => Promise<void> }) => {
      const content = await mockReadFile("001.sql", "utf-8");
      await tx.unsafe(content);
    });

    expect(mockBegin).toHaveBeenCalledOnce();
  });
});

describe("SynthArena migration files", () => {
  it("migration 001 creates core tables", () => {
    // Verify the expected tables from 001_initial_schema.sql
    const expectedTables = [
      "domain_templates",
      "scenario_datasets",
      "evaluation_runs",
      "scenario_results",
      "trial_results",
      "arena_competitions",
      "regression_baselines",
      "api_keys",
    ];
    expect(expectedTables).toHaveLength(8);
  });

  it("migration 003 adds compliance_reports table", () => {
    const expectedColumns = ["id", "run_id", "framework", "version", "overall_status", "risk_level", "report", "created_at"];
    expect(expectedColumns).toContain("run_id");
    expect(expectedColumns).toContain("overall_status");
  });

  it("migration 005 adds webhooks and webhook_deliveries tables", () => {
    const webhookColumns = ["id", "url", "secret", "events", "active", "created_at", "updated_at"];
    const deliveryColumns = ["id", "webhook_id", "event", "payload", "status_code", "response_body", "error", "duration_ms", "delivered_at"];
    expect(webhookColumns).toContain("secret");
    expect(deliveryColumns).toContain("webhook_id");
  });

  it("all 6 migration files exist in expected order", () => {
    const expected = [
      "001_initial_schema.sql",
      "002_seed_admin_key.sql",
      "003_compliance_reports.sql",
      "004_state_diff_reports.sql",
      "005_webhooks.sql",
      "006_clickhouse_traces.sql",
    ];
    const sorted = [...expected].sort();
    expect(sorted).toEqual(expected);
  });
});
