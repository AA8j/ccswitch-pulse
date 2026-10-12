import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const roots = ["bin", "src", "public", "test", "scripts", "e2e"];
const files = [];

async function collect(root) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) await collect(path);
    else if (/\.(?:js|mjs|cjs)$/.test(path)) files.push(path);
  }
}

for (const root of roots) await collect(root);
files.sort();
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`Syntax check passed for ${files.length} JavaScript files.`);
