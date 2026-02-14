import { existsSync } from "node:fs";
import chalk from "chalk";

interface Check {
  name: string;
  status: "pass" | "warn" | "fail";
  message: string;
}

export async function doctorCommand(): Promise<void> {
  console.log(chalk.bold("\n  SynthArena Doctor\n"));
  console.log(chalk.dim("  Checking your environment...\n"));

  const checks: Check[] = [];

  // Node.js version
  const nodeVersion = process.versions.node;
  const [major] = nodeVersion.split(".").map(Number);
  checks.push({
    name: "Node.js",
    status: (major ?? 0) >= 20 ? "pass" : (major ?? 0) >= 18 ? "warn" : "fail",
    message: (major ?? 0) >= 20
      ? `v${nodeVersion}`
      : (major ?? 0) >= 18
        ? `v${nodeVersion} (v20+ recommended)`
        : `v${nodeVersion} (v20+ required)`,
  });

  // Config file
  const hasConfig = existsSync("syntharena.yaml") || existsSync("syntharena.yml");
  checks.push({
    name: "Config",
    status: hasConfig ? "pass" : "warn",
    message: hasConfig ? "syntharena.yaml found" : "No config file. Run 'synth-arena init' to create one.",
  });

  // API key
  const hasApiKey = !!process.env["ANTHROPIC_API_KEY"];
  checks.push({
    name: "API Key",
    status: hasApiKey ? "pass" : "warn",
    message: hasApiKey ? "ANTHROPIC_API_KEY set" : "ANTHROPIC_API_KEY not set (needed for LLM-powered features)",
  });

  // API server
  try {
    const apiUrl = process.env["SYNTHARENA_API_URL"] ?? "http://localhost:3001";
    const res = await fetch(`${apiUrl}/health`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error("Not OK");
    const data = await res.json() as { version?: string };
    checks.push({
      name: "API Server",
      status: "pass",
      message: `Running at ${apiUrl} (v${data.version ?? "unknown"})`,
    });
  } catch {
    checks.push({
      name: "API Server",
      status: "warn",
      message: "Not reachable. Start with: pnpm dev (or use local-only mode)",
    });
  }

  // Docker
  try {
    const { execSync } = await import("node:child_process");
    const dockerVersion = execSync("docker --version 2>/dev/null", { encoding: "utf-8" }).trim();
    checks.push({ name: "Docker", status: "pass", message: dockerVersion });
  } catch {
    checks.push({ name: "Docker", status: "warn", message: "Not installed (needed for sandboxed execution)" });
  }

  // pnpm
  try {
    const { execSync } = await import("node:child_process");
    const pnpmVersion = execSync("pnpm --version 2>/dev/null", { encoding: "utf-8" }).trim();
    checks.push({ name: "pnpm", status: "pass", message: `v${pnpmVersion}` });
  } catch {
    checks.push({ name: "pnpm", status: "fail", message: "Not installed. Install with: npm i -g pnpm" });
  }

  // Package dependencies
  const hasNodeModules = existsSync("node_modules");
  checks.push({
    name: "Dependencies",
    status: hasNodeModules ? "pass" : "fail",
    message: hasNodeModules ? "node_modules exists" : "Missing. Run: pnpm install",
  });

  // Print results
  const icons = { pass: chalk.green("PASS"), warn: chalk.yellow("WARN"), fail: chalk.red("FAIL") };

  for (const check of checks) {
    console.log(`  ${icons[check.status]}  ${check.name.padEnd(14)} ${chalk.dim(check.message)}`);
  }

  const failures = checks.filter((c) => c.status === "fail");
  const warnings = checks.filter((c) => c.status === "warn");

  console.log();
  if (failures.length > 0) {
    console.log(chalk.red(`  ${failures.length} issue(s) must be resolved before using SynthArena.\n`));
    process.exitCode = 1;
  } else if (warnings.length > 0) {
    console.log(chalk.yellow(`  ${warnings.length} warning(s). SynthArena will work but some features may be limited.\n`));
  } else {
    console.log(chalk.green("  All checks passed. SynthArena is ready.\n"));
  }
}
