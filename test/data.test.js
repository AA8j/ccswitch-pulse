import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  chooseBucket,
  getMeta,
  getRequests,
  getSeries,
  parseRange,
  withDb,
} from "../src/data.js";

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "ccswitch-pulse-"));
  const path = join(dir, "usage.db");
  const db = new DatabaseSync(path);
  db.exec(`CREATE TABLE proxy_request_logs (
    created_at INTEGER NOT NULL, model TEXT NOT NULL, request_model TEXT,
    data_source TEXT NOT NULL, input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL, cache_read_tokens INTEGER NOT NULL,
    cache_creation_tokens INTEGER NOT NULL, total_cost_usd TEXT NOT NULL,
    status_code INTEGER NOT NULL
  )`);
  const insert = db.prepare(
    `INSERT INTO proxy_request_logs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  insert.run(
    1800000100,
    "glm-5",
    "claude-sonnet",
    "proxy",
    100,
    20,
    30,
    10,
    "0.125",
    200,
  );
  insert.run(
    1800000300,
    "glm-5",
    "claude-sonnet",
    "proxy",
    50,
    10,
    0,
    0,
    "0.075",
    200,
  );
  insert.run(
    1800003700,
    "gpt-5",
    "gpt-5",
    "codex_session",
    80,
    10,
    20,
    0,
    "0.100",
    200,
  );
  db.close();
  return { path, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("aggregates actual and requested models without writing to CC Switch", () => {
  const f = fixture();
  try {
    const actual = parseRange(
      new URLSearchParams(
        "from=1800000000&to=1800007200&bucket=1h&modelMode=actual",
      ),
      {},
    );
    const result = getSeries(f.path, actual);
    assert.equal(result.totals.calls, 3);
    assert.equal(result.totals.tokens, 330);
    assert.equal(result.totals.cost, 0.3);
    assert.equal(result.totals.models, 2);
    assert.equal(
      result.rows
        .filter((row) => row.model === "glm-5")
        .reduce((sum, row) => sum + row.calls, 0),
      2,
    );
    const requested = { ...actual, modelMode: "requested" };
    assert.equal(
      getSeries(f.path, requested)
        .rows.filter((row) => row.model === "claude-sonnet")
        .reduce((sum, row) => sum + row.calls, 0),
      2,
    );
    assert.throws(() =>
      withDb(f.path, (db) => db.exec("DELETE FROM proxy_request_logs")),
    );
    assert.equal(getMeta(f.path).count, 3);
  } finally {
    f.cleanup();
  }
});

test("filters sources and exposes only safe request fields", () => {
  const f = fixture();
  try {
    const range = parseRange(
      new URLSearchParams(
        "from=1800000000&to=1800007200&bucket=1h&source=proxy",
      ),
      {},
    );
    assert.equal(getSeries(f.path, range).totals.calls, 2);
    const requests = getRequests(f.path, range);
    assert.equal(requests.length, 2);
    assert.equal(requests[0].inputTokens, 50);
    assert.deepEqual(Object.keys(requests[0]), [
      "time",
      "model",
      "source",
      "inputTokens",
      "outputTokens",
      "cost",
      "status",
    ]);
  } finally {
    f.cleanup();
  }
});

test("validates ranges and bounds bucket counts", () => {
  assert.equal(chooseBucket(0, 86400, "auto"), 900);
  assert.throws(
    () => parseRange(new URLSearchParams("from=10&to=5"), {}),
    RangeError,
  );
  assert.throws(
    () => parseRange(new URLSearchParams("from=0&to=31536000&bucket=5m"), {}),
    RangeError,
  );
  assert.throws(
    () =>
      parseRange(
        new URLSearchParams("from=0&to=10&source=proxy%27%20OR%201"),
        {},
      ),
    RangeError,
  );
});
