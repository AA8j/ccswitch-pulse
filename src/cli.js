import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { defaultDbPath } from "./data.js";
import { startServer } from "./server.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json");

export const usage = `CCSwitch Pulse · local model usage dashboard v${version}

Usage:
  ccswitch-pulse [--db /path/to/cc-switch.db] [--port 3456] [--no-open]
  ccswitch-pulse --demo [--port 3456]

Options:
  --db PATH    Read a specific CC Switch SQLite database (read-only)
  --port N     Local port; 0 selects an available port (default: 3456)
  --demo       Open a synthetic sample dashboard without a database
  --no-open    Do not open the browser automatically
  --version    Print the installed version
  --help       Show this help

Default database: ${defaultDbPath()}
Environment overrides: CC_SWITCH_DB, CCSWITCH_PULSE_DEMO_END (demo Unix timestamp)`;

export function parseArgs(args, env = process.env) {
  const options = {
    dbPath: env.CC_SWITCH_DB || defaultDbPath(),
    port: 3456,
    demo: false,
    open: true,
  };
  let explicitDb = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") return { help: true };
    if (arg === "--version" || arg === "-v") return { version: true };
    if (arg === "--demo") {
      options.demo = true;
    } else if (arg === "--no-open") {
      options.open = false;
    } else if (arg === "--db") {
      const value = args[++i];
      if (!value || value.startsWith("--")) throw new Error("--db requires a path");
      options.dbPath = resolve(value);
      explicitDb = true;
    } else if (arg === "--port") {
      const value = args[++i];
      const port = Number(value);
      if (!value || value.startsWith("--") || !Number.isInteger(port) || port < 0 || port > 65535)
        throw new Error("--port must be 0–65535");
      options.port = port;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  if (options.demo && explicitDb)
    throw new Error("--demo cannot be combined with --db");
  return options;
}

export function openBrowser(url, platform = process.platform) {
  const command =
    platform === "darwin"
      ? "open"
      : platform === "win32"
        ? "cmd"
        : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.on("error", () => {});
  child.unref();
}

export async function runCli(args = process.argv.slice(2), env = process.env, io = console) {
  const options = parseArgs(args, env);
  if (options.help) {
    io.log(usage);
    return null;
  }
  if (options.version) {
    io.log(version);
    return null;
  }
  const server = await startServer(options);
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}`;
  io.log(`\n  CCSwitch Pulse is ready at ${url}`);
  io.log(options.demo ? "  Data source: built-in demo" : `  Data source: ${options.dbPath}`);
  io.log("  Press Ctrl+C to stop.\n");
  if (options.open) openBrowser(url);
  return server;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    const server = await runCli();
    if (server) {
      const shutdown = () => server.close(() => process.exit(0));
      process.once("SIGINT", shutdown);
      process.once("SIGTERM", shutdown);
    }
  } catch (error) {
    console.error(`CCSwitch Pulse: ${error.message}`);
    process.exitCode = 1;
  }
}
