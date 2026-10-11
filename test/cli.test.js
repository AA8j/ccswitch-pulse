import test from "node:test";
import assert from "node:assert/strict";
import { parseArgs } from "../src/cli.js";

const env = { HOME: "/tmp/ccswitch-pulse-home", CC_SWITCH_DB: "/tmp/ccswitch-pulse-home/custom.db" };

test("parses CLI options and environment defaults", () => {
  const options = parseArgs(["--demo", "--port", "0", "--no-open"], env);
  assert.deepEqual(options, {
    dbPath: "/tmp/ccswitch-pulse-home/custom.db",
    port: 0,
    demo: true,
    open: false,
  });
});

test("rejects ambiguous and malformed CLI options", () => {
  assert.throws(() => parseArgs(["--demo", "--db", "usage.db"], env), /cannot be combined/);
  assert.throws(() => parseArgs(["--db", "--port", "0"], env), /requires a path/);
  assert.throws(() => parseArgs(["--port", "--no-open"], env), /must be 0/);
  assert.throws(() => parseArgs(["--unknown"], env), /Unknown option/);
});

test("supports help and version intents without starting a server", () => {
  assert.deepEqual(parseArgs(["--help"], env), { help: true });
  assert.deepEqual(parseArgs(["--version"], env), { version: true });
});
