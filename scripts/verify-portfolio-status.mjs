#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalFrozenRuntimeManifest, collectFrozenRuntime } from "./frozen-runtime.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const readJson = (path) => JSON.parse(read(path));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const expectedStatus = {
  schema_version: 1,
  project: "SynthArena",
  effective_date: "2026-08-30",
  status: "internal_evaluation_tooling",
  release_status: "hold",
  frozen_runtime_manifest_sha256: "90e7e94d92830340c4ba7658bf15da784953ba80c2a377182a795d2b6a7a5ae1",
  standalone_product: {
    company: false,
    customer_saas: false,
    marketplace: false,
    billing: false,
    customer_acquisition: "stopped",
    deployments: "not_authorized",
    runtime_state: "unverified",
  },
  hosted_workflows: "manual_only",
  allowed_work: [
    "preservation",
    "archive_security_fix",
    "read_only_research",
    "named_consumer_contract_discovery",
    "bounded_asset_extraction_with_named_consumer",
  ],
  prohibited_without_adoption: [
    "standalone_feature_development",
    "customer_or_pilot_claims",
    "deployment_or_provider_spend",
    "marketplace_or_billing",
    "production_or_compliance_claims",
    "automatic_workflow_restoration",
    "shared_platform_expansion",
  ],
  shared_infrastructure: {
    adopted: false,
    minimum_independent_consumers: 2,
    requires_named_consumer: true,
    requires_versioned_contract: true,
    consumers: [],
  },
  adoption_gates: [
    {
      id: "named_consumer",
      requirement: "A bounded extraction names the active product, accountable owner, repository, exact asset, and user outcome it supports.",
    },
    {
      id: "versioned_contract",
      requirement: "The consuming product owns a versioned input, output, error, provenance, security, and rollback contract with executable conformance evidence.",
    },
    {
      id: "two_product_shared_need",
      requirement: "Shared-platform development remains frozen until two independent active products adopt the same contract and prove that duplication is materially harmful.",
    },
    {
      id: "runtime_truth",
      requirement: "Any claimed sandbox, evaluator, trace, replay, cost, or deployment property is proven through the real producer and consumer boundary at an exact revision.",
    },
    {
      id: "outcome_and_economics",
      requirement: "Observed product outcomes justify the maintenance, infrastructure, provider, support, and security cost of the shared asset.",
    },
  ],
};

assert.deepEqual(readJson("PROJECT_STATUS.json"), expectedStatus);

const packageJson = readJson("package.json");
assert.equal(packageJson.private, true);
assert.equal(packageJson.description, "Private internal agent-evaluation tooling; not a standalone product");
assert.equal(packageJson.scripts["status:verify"], "node scripts/verify-portfolio-status.mjs");
assert.equal(Object.keys(packageJson.scripts).some((name) => name.startsWith("release:")), false);
for (const prohibitedScript of ["dev", "cli", "db:migrate", "db:seed"]) {
  assert.equal(prohibitedScript in packageJson.scripts, false, `${prohibitedScript} must not be an active root command`);
}

const expectedWorkflow = `name: Verify Internal Tooling Contract

on:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  verify:
    name: Verify portfolio disposition
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262
      - name: Verify internal-tooling boundary
        run: node scripts/verify-portfolio-status.mjs
`;

const workflowDir = resolve(root, ".github/workflows");
const activeWorkflows = readdirSync(workflowDir)
  .filter((name) => /\.ya?ml$/u.test(name))
  .sort();
assert.deepEqual(activeWorkflows, ["internal-tooling-verification.yml"]);
assert.equal(read(".github/workflows/internal-tooling-verification.yml"), expectedWorkflow);

for (const retiredPath of [
  ".github/workflows/ci.yml",
  ".github/workflows/eval-gate.yml",
  "action/action.yml",
]) {
  assert.equal(existsSync(resolve(root, retiredPath)), false, `${retiredPath} must remain retired`);
}
assert.equal(existsSync(resolve(root, "action")), false, "the distributable action directory must remain retired");

const ignoredScanDirectories = new Set([".git", ".next", ".turbo", "coverage", "dist", "node_modules"]);
function findActionMetadata(directory, matches = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (/^action\.ya?ml$/u.test(basename(path))) matches.push(path);
    if (entry.isDirectory() && !ignoredScanDirectories.has(entry.name)) findActionMetadata(path, matches);
  }
  return matches;
}
assert.deepEqual(findActionMetadata(root), [], "recognized GitHub Action metadata must remain absent");

const expectedPlanTombstone = `# SynthArena Plan Status

The standalone SynthArena plan is superseded by \`PROJECT_STATUS.json\` and \`docs/INTERNAL_TOOLING_BOUNDARY.md\`.

The original plan is preserved without modification at \`docs/historical/plans/GRAND_PLAN.md\`. It is historical material, not current roadmap, product, deployment, pricing, marketplace, or capability authority.
`;
const expectedProgressTombstone = `# SynthArena Progress Status

The previous completion report is superseded by \`PROJECT_STATUS.json\` and does not establish current product, runtime, deployment, customer, or adoption status.

The original report is preserved without modification at \`docs/historical/plans/OVERNIGHT_PROGRESS.md\`.
`;
assert.equal(read("GRAND_PLAN.md"), expectedPlanTombstone);
assert.equal(read("OVERNIGHT_PROGRESS.md"), expectedProgressTombstone);

const expectedHistorical = [
  "docs/historical/action/action.yml.txt",
  "docs/historical/packaging/sdk-python.pyproject.toml",
  "docs/historical/packaging/sdk-ts.package.json",
  "docs/historical/plans/GRAND_PLAN.md",
  "docs/historical/plans/OVERNIGHT_PROGRESS.md",
  "docs/historical/workflows/ci.yml",
  "docs/historical/workflows/eval-gate.yml",
];
const manifestLines = read("docs/historical/SHA256SUMS").trim().split("\n");
const manifest = new Map(manifestLines.map((line) => {
  const match = /^([0-9a-f]{64})  ([A-Za-z0-9_./-]+)$/u.exec(line);
  assert.ok(match, `Malformed historical manifest line: ${line}`);
  assert.ok(!match[2].includes(".."), `Unsafe historical manifest path: ${match[2]}`);
  return [match[2], match[1]];
}));
assert.deepEqual([...manifest.keys()].sort(), expectedHistorical);
for (const [path, digest] of manifest) assert.equal(sha256(read(path)), digest, path);

const frozenRuntimeRaw = read("FROZEN_RUNTIME_MANIFEST.json");
assert.equal(sha256(frozenRuntimeRaw), expectedStatus.frozen_runtime_manifest_sha256);
const frozenRuntimeManifest = JSON.parse(frozenRuntimeRaw);
assert.equal(canonicalFrozenRuntimeManifest(frozenRuntimeManifest), frozenRuntimeRaw);
assert.deepEqual(collectFrozenRuntime(root), frozenRuntimeManifest);

const workspaceManifests = frozenRuntimeManifest.files
  .map((entry) => entry.path)
  .filter((path) => /^(?:apps|packages)\/[^/]+\/package\.json$/u.test(path));
assert.ok(workspaceManifests.length > 0, "workspace package manifests must be inventoried");
for (const path of workspaceManifests) {
  const workspacePackage = readJson(path);
  assert.equal(workspacePackage.private, true, `${path} must disable registry publication`);
  assert.equal("publishConfig" in workspacePackage, false, `${path} must not define publishConfig`);
  for (const script of ["prepublish", "prepublishOnly", "publish", "prepack", "postpack"]) {
    assert.equal(script in (workspacePackage.scripts ?? {}), false, `${path} must not define ${script}`);
  }
}
assert.equal("version" in readJson("packages/sdk-ts/package.json"), false);
assert.equal(
  read("packages/sdk-python/pyproject.toml"),
  '# Internal test configuration only. Packaging metadata is intentionally archived.\n\n[tool.pytest.ini_options]\nasyncio_mode = "auto"\ntestpaths = ["tests"]\n',
);
assert.equal(existsSync(resolve(root, "packages/sdk-python/setup.py")), false);
assert.equal(existsSync(resolve(root, "packages/sdk-python/setup.cfg")), false);
assert.equal(existsSync(resolve(root, "packages/sdk-python/MANIFEST.in")), false);

for (const authorityFile of ["README.md", "AGENTS.md", "CLAUDE.md"]) {
  const contents = read(authorityFile);
  assert.ok(contents.includes("PROJECT_STATUS.json"), `${authorityFile} must cite the status authority`);
  assert.ok(contents.includes("standalone"), `${authorityFile} must state the standalone boundary`);
}

assert.equal(expectedStatus.shared_infrastructure.adopted, false);
assert.equal(expectedStatus.shared_infrastructure.minimum_independent_consumers, 2);
assert.deepEqual(expectedStatus.shared_infrastructure.consumers, []);

const expectedHooks = {
  hooks: {
    UserPromptSubmit: [{
      hooks: [{
        type: "command",
        command: "bash \"$(git rev-parse --show-toplevel)/.codex/hooks/arch-review-inject.sh\"",
        timeout: 5,
      }],
    }],
    Stop: [{
      hooks: [{
        type: "command",
        command: "bash \"$(git rev-parse --show-toplevel)/.codex/hooks/stop-quality-prompt.sh\"",
        timeout: 30,
      }],
    }],
  },
};
assert.deepEqual(readJson(".codex/hooks.json"), expectedHooks);
for (const hook of [
  ".codex/hooks/arch-review-inject.sh",
  ".codex/hooks/stop-quality-prompt.sh",
  ".codex/hooks/test-hooks.sh",
]) {
  assert.notEqual(statSync(resolve(root, hook)).mode & 0o111, 0, `${hook} must be executable`);
}

for (const skill of ["independent-review", "pr-lifecycle", "project-quality", "ship"]) {
  assert.equal(
    read(`.agents/skills/${skill}/SKILL.md`),
    read(`.claude/skills/${skill}/SKILL.md`),
    `${skill} skill copies must remain identical`,
  );
}
const prLifecycle = read(".agents/skills/pr-lifecycle/SKILL.md");
assert.ok(prLifecycle.includes("potentialMergeCommit"));
assert.ok(prLifecycle.includes('"${REVIEWED_MERGE_COMMIT_SHA}:refs/heads/${PR_DEFAULT_BRANCH}"'));

console.log("SynthArena internal-tooling contract verified");
