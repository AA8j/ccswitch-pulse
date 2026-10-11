#!/usr/bin/env node

process.removeAllListeners("warning");
process.on("warning", (warning) => {
  if (
    warning.name === "ExperimentalWarning" &&
    /SQLite/.test(String(warning.message))
  )
    return;
  console.warn(warning.stack || warning);
});

const { runCli } = await import("../src/cli.js");

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
