#!/usr/bin/env node
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { startServer } from "../src/server.js";
import { defaultDbPath } from "../src/data.js";

const usage = `CCSwitch Pulse · local model usage dashboard

Usage:
  ccswitch-pulse [--db /path/to/cc-switch.db] [--port 3456] [--no-open]
  ccswitch-pulse --demo [--port 3456]

Options:
  --db PATH    Read a specific CC Switch SQLite database (read-only)
  --port N     Local port; 0 selects an available port (default: 3456)
  --demo       Open a deterministic sample dashboard without a database
  --no-open    Do not open the browser automatically
  --help       Show this help

Default database: ${defaultDbPath()}
Environment override: CC_SWITCH_DB`;

function parseArgs(args) {
  const options = {
    dbPath: process.env.CC_SWITCH_DB || defaultDbPath(),
    port: 3456,
    demo: false,
    open: true,
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") return { help: true };
    if (arg === "--demo") options.demo = true;
    else if (arg === "--no-open") options.open = false;
    else if (arg === "--db") {
      if (!args[i + 1]) throw new Error("--db requires a path");
      options.dbPath = resolve(args[++i]);
    } else if (arg === "--port") {
      const value = Number(args[++i]);
      if (!Number.isInteger(value) || value < 0 || value > 65535)
        throw new Error("--port must be 0–65535");
      options.port = value;
    } else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function openBrowser(url) {
  const command =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "cmd"
        : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.on("error", () => {});
  child.unref();
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage);
    process.exit(0);
  }
  const server = await startServer(options);
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}`;
  console.log(`\n  CCSwitch Pulse is ready at ${url}`);
  console.log(
    options.demo
      ? "  Data source: built-in demo"
      : `  Data source: ${options.dbPath}`,
  );
  console.log("  Press Ctrl+C to stop.\n");
  if (options.open) openBrowser(url);
} catch (error) {
  console.error(`CCSwitch Pulse: ${error.message}`);
  process.exitCode = 1;
}
