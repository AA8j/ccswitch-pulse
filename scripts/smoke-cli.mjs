import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const child = spawn(process.execPath, ["./bin/ccswitch-pulse.js", "--demo", "--port", "0", "--no-open"], {
  cwd: process.cwd(),
  env: { ...process.env, CCSWITCH_PULSE_DEMO_END: "1791723600" },
  stdio: ["ignore", "pipe", "pipe"],
});

let output = "";
let errorOutput = "";
child.stdout.setEncoding("utf8");
child.stderr.setEncoding("utf8");
child.stdout.on("data", (chunk) => { output += chunk; });
child.stderr.on("data", (chunk) => { errorOutput += chunk; });

function stop() {
  if (!child.killed) child.kill("SIGTERM");
}

try {
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`CLI smoke timed out\n${output}\n${errorOutput}`)), 10_000);
    const check = () => {
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) {
        clearTimeout(timer);
        resolve(match[0]);
      }
    };
    child.stdout.on("data", check);
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code && !output.includes("ready at")) reject(new Error(`CLI exited with ${code}\n${output}\n${errorOutput}`));
    });
  });

  const meta = await fetch(`${url}/api/meta`).then((response) => response.json());
  assert.equal(meta.available, true);
  assert.equal(meta.demo, true);
  assert.equal(meta.hasRollups, true);
  assert.equal(meta.sources.length, 2);

  const series = await fetch(`${url}/api/series?from=${meta.first}&to=${meta.last + 1}&bucket=1d&offset=28800`).then((response) => response.json());
  assert.ok(series.totals.calls > 0);
  assert.ok(series.coverage.historicalIncluded);

  const methodResponse = await fetch(`${url}/api/meta`, { method: "POST" });
  assert.equal(methodResponse.status, 405);
  console.log("CLI smoke passed.");
} finally {
  stop();
}
