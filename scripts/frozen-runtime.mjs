import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, readlinkSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

export const FROZEN_RUNTIME_ROOTS = ["."];
export const FROZEN_RUNTIME_EXCLUDED_PATHS = [
  "FROZEN_RUNTIME_MANIFEST.json",
  "PROJECT_STATUS.json",
];

const FALLBACK_IGNORED_DIRECTORIES = new Set([".git"]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function parseNullDelimited(buffer) {
  return buffer.toString("utf8").split("\0").filter(Boolean);
}

function gitPaths(root, args) {
  const result = spawnSync("git", ["ls-files", "-z", ...args], {
    cwd: root,
    encoding: "buffer",
  });
  if (result.status !== 0) return null;
  return parseNullDelimited(result.stdout);
}

function walkFallback(root, directory, paths) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && FALLBACK_IGNORED_DIRECTORIES.has(entry.name)) continue;
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) walkFallback(root, absolutePath, paths);
    else paths.push(relative(root, absolutePath).split(sep).join("/"));
  }
}

function candidatePaths(root) {
  const cached = gitPaths(root, ["--cached"]);
  if (cached?.length) {
    const untracked = gitPaths(root, ["--others", "--exclude-standard"]);
    if (untracked === null) throw new Error("Unable to enumerate untracked repository paths");
    return [...new Set([...cached, ...untracked])].sort();
  }

  const paths = [];
  walkFallback(root, root, paths);
  return paths.sort();
}

function collectFile(root, path) {
  if (path.startsWith("/") || path.split("/").includes("..")) {
    throw new Error(`Unsafe frozen-runtime path: ${path}`);
  }
  const absolutePath = resolve(root, path);
  const stat = lstatSync(absolutePath);
  if (stat.isSymbolicLink()) {
    return { path, sha256: sha256(`symlink:${readlinkSync(absolutePath)}`), type: "symlink" };
  }
  if (!stat.isFile()) throw new Error(`Unsupported frozen-runtime entry: ${path}`);
  return { path, sha256: sha256(readFileSync(absolutePath)), type: "file" };
}

export function collectFrozenRuntime(rootPath) {
  const root = resolve(rootPath);
  const excluded = new Set(FROZEN_RUNTIME_EXCLUDED_PATHS);
  const files = candidatePaths(root)
    .filter((path) => !excluded.has(path))
    .map((path) => collectFile(root, path));
  return {
    schema_version: 2,
    status: "frozen_without_adopted_consumers",
    roots: FROZEN_RUNTIME_ROOTS,
    excluded_paths: FROZEN_RUNTIME_EXCLUDED_PATHS,
    files,
  };
}

export function canonicalFrozenRuntimeManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
