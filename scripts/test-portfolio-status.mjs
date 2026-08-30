#!/usr/bin/env node

import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const sourceRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const tempRoot = mkdtempSync(join(tmpdir(), "syntharena-status-"));
const trackedResult = spawnSync("git", ["ls-files", "-z", "--cached"], {
  cwd: sourceRoot,
  encoding: "buffer",
});
assert.equal(trackedResult.status, 0, trackedResult.stderr?.toString("utf8"));
let fixturePaths = trackedResult.stdout.toString("utf8").split("\0").filter(Boolean);
if (fixturePaths.length === 0) {
  const manifest = JSON.parse(readFileSync(join(sourceRoot, "FROZEN_RUNTIME_MANIFEST.json"), "utf8"));
  fixturePaths = [
    ...manifest.files.map((entry) => entry.path),
    ...manifest.excluded_paths,
  ];
}
fixturePaths.sort();

function makeFixture(name) {
  const root = join(tempRoot, name);
  for (const relative of fixturePaths) {
    const source = join(sourceRoot, relative);
    const destination = join(root, relative);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(source, destination, { recursive: true, preserveTimestamps: true });
  }
  const init = spawnSync("git", ["init", "-q"], { cwd: root, encoding: "utf8" });
  assert.equal(init.status, 0, init.stderr);
  const add = spawnSync("git", ["add", "-f", "--all"], { cwd: root, encoding: "utf8" });
  assert.equal(add.status, 0, add.stderr);
  return root;
}

function runVerifier(root) {
  return spawnSync(process.execPath, [join(root, "scripts/verify-portfolio-status.mjs")], {
    cwd: root,
    encoding: "utf8",
  });
}

function expectRejected(name, mutate) {
  const root = makeFixture(name);
  mutate(root);
  const result = runVerifier(root);
  assert.notEqual(result.status, 0, `${name} unexpectedly passed`);
}

try {
  const baseline = makeFixture("baseline");
  const baselineResult = runVerifier(baseline);
  assert.equal(baselineResult.status, 0, baselineResult.stderr || baselineResult.stdout);

  expectRejected("automatic-trigger", (root) => {
    const file = join(root, ".github/workflows/internal-tooling-verification.yml");
    writeFileSync(file, readFileSync(file, "utf8").replace("workflow_dispatch:", "push:"));
  });
  expectRejected("extra-workflow", (root) => {
    writeFileSync(join(root, ".github/workflows/ci.yml"), "name: CI\non:\n  push:\n");
  });
  expectRejected("standalone-revival", (root) => {
    const file = join(root, "PROJECT_STATUS.json");
    const status = JSON.parse(readFileSync(file, "utf8"));
    status.standalone_product.company = true;
    writeFileSync(file, `${JSON.stringify(status, null, 2)}\n`);
  });
  expectRejected("weakened-consumer-gate", (root) => {
    const file = join(root, "PROJECT_STATUS.json");
    const status = JSON.parse(readFileSync(file, "utf8"));
    status.shared_infrastructure.minimum_independent_consumers = 1;
    writeFileSync(file, `${JSON.stringify(status, null, 2)}\n`);
  });
  expectRejected("restored-action", (root) => {
    const file = join(root, "action/action.yml");
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, "name: Restored action\n");
  });
  expectRejected("nested-action-metadata", (root) => {
    const file = join(root, "docs/archive-copy/action.yaml");
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, "name: Still executable\nruns:\n  using: composite\n");
  });
  expectRejected("ignored-directory-action-metadata", (root) => {
    const file = join(root, "docs/dist/action.yml");
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, "name: Ignored but executable\nruns:\n  using: composite\n");
  });
  expectRejected("historical-tamper", (root) => {
    const file = join(root, "docs/historical/action/action.yml.txt");
    writeFileSync(file, `${readFileSync(file, "utf8")}\n# changed\n`);
  });
  expectRejected("restored-roadmap-claims", (root) => {
    writeFileSync(join(root, "GRAND_PLAN.md"), "# Standalone product roadmap\n\nLaunch the marketplace.\n");
  });
  expectRejected("host-specific-hook", (root) => {
    const file = join(root, ".codex/hooks.json");
    const hooks = JSON.parse(readFileSync(file, "utf8"));
    hooks.hooks.Stop[0].hooks[0].command = "/tmp/host-specific-hook.sh";
    writeFileSync(file, `${JSON.stringify(hooks, null, 2)}\n`);
  });
  expectRejected("skill-drift", (root) => {
    const file = join(root, ".claude/skills/ship/SKILL.md");
    writeFileSync(file, `${readFileSync(file, "utf8")}\nDrift.\n`);
  });
  expectRejected("publishable-typescript-sdk", (root) => {
    const file = join(root, "packages/sdk-ts/package.json");
    const manifest = JSON.parse(readFileSync(file, "utf8"));
    manifest.private = false;
    manifest.version = "0.1.0";
    manifest.scripts.prepublishOnly = "npm run build";
    writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
  });
  expectRejected("publishable-python-sdk", (root) => {
    const file = join(root, "packages/sdk-python/pyproject.toml");
    writeFileSync(file, `${readFileSync(file, "utf8")}\n[build-system]\nbuild-backend = "setuptools.build_meta"\n`);
  });
  expectRejected("runtime-expansion", (root) => {
    const file = join(root, "apps/research-stack/src/controller.ts");
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, "export const revived = true;\n");
  });
  expectRejected("runtime-modification", (root) => {
    const file = join(root, "apps/api/src/index.ts");
    writeFileSync(file, `${readFileSync(file, "utf8")}\n// unadopted runtime change\n`);
  });
  expectRejected("root-script-authority-revival", (root) => {
    const script = join(root, "scripts/revive-standalone.mjs");
    writeFileSync(script, "console.log('revived');\n");
    const packageFile = join(root, "package.json");
    const packageJson = JSON.parse(readFileSync(packageFile, "utf8"));
    packageJson.scripts.postinstall = "node scripts/revive-standalone.mjs";
    writeFileSync(packageFile, `${JSON.stringify(packageJson, null, 2)}\n`);
  });
  expectRejected("tracked-ignored-runtime-expansion", (root) => {
    const script = join(root, "scripts/dist/revive-standalone.mjs");
    mkdirSync(dirname(script), { recursive: true });
    writeFileSync(script, "console.log('tracked ignored runtime');\n");
    const add = spawnSync("git", ["add", "-f", "scripts/dist/revive-standalone.mjs"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(add.status, 0, add.stderr);
  });

  console.log("SynthArena portfolio-status adversarial checks passed");
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
