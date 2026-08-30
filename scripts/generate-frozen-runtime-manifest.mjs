#!/usr/bin/env node

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalFrozenRuntimeManifest, collectFrozenRuntime } from "./frozen-runtime.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const output = resolve(root, "FROZEN_RUNTIME_MANIFEST.json");
writeFileSync(output, canonicalFrozenRuntimeManifest(collectFrozenRuntime(root)));
console.log(`Wrote ${output}`);
