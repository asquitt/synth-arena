import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync, readlinkSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

export const FROZEN_RUNTIME_ROOTS = [
  ".env.example",
  "apps",
  "docker",
  "domains",
  "packages",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "scripts/generate-domain-scenarios.mjs",
  "tests",
  "tsconfig.base.json",
  "turbo.json",
];

const IGNORED_DIRECTORIES = new Set([
  ".next",
  ".pytest_cache",
  ".turbo",
  "__pycache__",
  "coverage",
  "dist",
  "node_modules",
]);

function ignoredFile(name) {
  return name === ".DS_Store" || name.endsWith(".pyc") || name.endsWith(".tsbuildinfo");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function collectPath(root, absolutePath, files) {
  const stat = lstatSync(absolutePath);
  const path = relative(root, absolutePath).split(sep).join("/");
  if (stat.isSymbolicLink()) {
    files.push({ path, sha256: sha256(`symlink:${readlinkSync(absolutePath)}`), type: "symlink" });
    return;
  }
  if (stat.isFile()) {
    if (!ignoredFile(path.split("/").at(-1))) {
      files.push({ path, sha256: sha256(readFileSync(absolutePath)), type: "file" });
    }
    return;
  }
  if (!stat.isDirectory()) throw new Error(`Unsupported frozen-runtime entry: ${path}`);
  for (const name of readdirSync(absolutePath).sort()) {
    if (IGNORED_DIRECTORIES.has(name)) continue;
    collectPath(root, join(absolutePath, name), files);
  }
}

export function collectFrozenRuntime(rootPath) {
  const root = resolve(rootPath);
  const files = [];
  for (const runtimeRoot of FROZEN_RUNTIME_ROOTS) {
    const absolutePath = resolve(root, runtimeRoot);
    if (existsSync(absolutePath)) collectPath(root, absolutePath, files);
  }
  files.sort((left, right) => left.path.localeCompare(right.path));
  return {
    schema_version: 1,
    status: "frozen_without_adopted_consumers",
    roots: FROZEN_RUNTIME_ROOTS,
    files,
  };
}

export function canonicalFrozenRuntimeManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
