#!/usr/bin/env node

import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const targets = [
  "dist",
  "packages/app/dist",
  "packages/orchestrator/dist",
  "packages/server/dist",
  "packages/desktop/src-tauri/target",
  "packages/desktop/src-tauri/sidecars",
];

let removedCount = 0;
for (const relative of targets) {
  const absolute = resolve(root, relative);
  if (!existsSync(absolute)) continue;
  rmSync(absolute, { recursive: true, force: true });
  removedCount += 1;
  console.log(`[clean] removed: ${relative}`);
}

if (removedCount === 0) {
  console.log("[clean] no artifacts found");
} else {
  console.log(`[clean] done (${removedCount} paths)`);
}
