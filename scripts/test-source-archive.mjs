#!/usr/bin/env node

import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const archiveRoot = mkdtempSync(join(tmpdir(), "syntharena-archive-"));
const archiveRef = process.env.SYNTHARENA_ARCHIVE_REF || "HEAD";

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: options.encoding ?? "utf8",
    input: options.input,
    maxBuffer: 64 * 1024 * 1024,
  });
}

try {
  const archive = run("git", ["archive", "--format=tar", archiveRef], { encoding: "buffer" });
  assert.equal(archive.status, 0, archive.stderr?.toString("utf8"));

  const extract = run("tar", ["-x", "-C", archiveRoot], {
    encoding: "buffer",
    input: archive.stdout,
  });
  assert.equal(extract.status, 0, extract.stderr?.toString("utf8"));
  assert.equal(existsSync(join(archiveRoot, ".git")), false, "archive replay must not contain Git metadata");

  for (const [label, command, args] of [
    ["status verifier", process.execPath, ["scripts/verify-portfolio-status.mjs"]],
    ["adversarial suite", process.execPath, ["scripts/test-portfolio-status.mjs"]],
  ]) {
    const result = run(command, args, { cwd: archiveRoot });
    assert.equal(result.status, 0, `${label} failed:\n${result.stderr || result.stdout}`);
  }

  console.log("SynthArena no-index source-archive checks passed");
} finally {
  rmSync(archiveRoot, { recursive: true, force: true });
}
