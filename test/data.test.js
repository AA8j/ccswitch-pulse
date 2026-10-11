import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  chooseBucket,
  getMeta,
  getHeatmap,
  getRequests,
  getSessions,
  getSeries,
  parseRange,
  withDb,
} from "../src/data.js";
import { getReport } from "../src/report.js";

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

function optionalColumnsFixture() {
  const dir = mkdtempSync(join(tmpdir(), "ccswitch-pulse-optional-"));
  const path = join(dir, "usage.db");
  const db = new DatabaseSync(path);
  db.exec(`CREATE TABLE proxy_request_logs (
    created_at INTEGER NOT NULL, model TEXT NOT NULL, data_source TEXT NOT NULL,
    input_tokens INTEGER, output_tokens INTEGER, cache_read_tokens INTEGER,
    cache_creation_tokens INTEGER, total_cost_usd TEXT
  )`);
  db.prepare("INSERT INTO proxy_request_logs VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(1800000100, "glm-5", "proxy", null, 10, null, 0, "0.125");
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

test("combines archived daily rows with retained details on the same day", () => {
  const f = fixture();
  try {
    const db = new DatabaseSync(f.path);
    db.exec(`CREATE TABLE usage_daily_rollups (
      date TEXT, model TEXT, request_model TEXT, request_count INTEGER,
      input_tokens INTEGER, output_tokens INTEGER, cache_read_tokens INTEGER,
      cache_creation_tokens INTEGER, total_cost_usd TEXT
    )`);
    const day = new Date(1800000100 * 1000).toISOString().slice(0, 10);
    const prior = new Date(Date.parse(`${day}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
    const insert = db.prepare("INSERT INTO usage_daily_rollups VALUES (?, 'glm-5', 'claude-sonnet', ?, 100, 20, 0, 0, '0.5')");
    insert.run(prior, 7);
    insert.run(day, 5);
    db.close();
    const start = Date.parse(`${prior}T00:00:00Z`) / 1000;
    const range = parseRange(new URLSearchParams({ from: String(start), to: String(start + 2 * 86400), bucket: "1d" }), {});
    const result = getSeries(f.path, range);
    assert.equal(result.totals.calls, 15);
    assert.equal(result.coverage.historicalCalls, 12);
    assert.equal(result.totals.tokens, 570);
    assert.equal(getMeta(f.path).count, 15);
    const report = getReport(f.path, range, "all");
    assert.equal(report.current.calls, 15);
    assert.equal(report.current.activeDays, 2);
    const writable = new DatabaseSync(f.path);
    writable.exec("DELETE FROM proxy_request_logs");
    writable.close();
    assert.equal(getMeta(f.path).count, 12);
    assert.equal(getSeries(f.path, range).totals.calls, 12);
  } finally { f.cleanup(); }
});

test("weekly buckets begin on Monday and imported sessions group separately", () => {
  const f = fixture();
  try {
    const monday = Date.UTC(2026, 9, 5) / 1000;
    const db = new DatabaseSync(f.path);
    db.exec("ALTER TABLE proxy_request_logs ADD COLUMN session_id TEXT");
    db.prepare("INSERT INTO proxy_request_logs VALUES (?, 'gpt-6', 'gpt-6', 'codex_session', 10, 5, 0, 0, '0.01', 200, 'session-a')")
      .run(monday + 86400);
    db.prepare("INSERT INTO proxy_request_logs VALUES (?, 'gpt-6', 'gpt-6', 'codex_session', 10, 5, 0, 0, '0.01', 200, 'session-a')")
      .run(monday + 2 * 86400);
    db.close();
    const range = parseRange(new URLSearchParams({ from: String(monday), to: String(monday + 7 * 86400), bucket: "1w" }), {});
    const result = getSeries(f.path, range);
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].bucket, monday);
    assert.equal(result.rows[0].calls, 2);
    assert.equal(getSessions(f.path, range).rows[0].calls, 2);
    const singleRange = { ...range, from: monday + 86400, to: monday + 86400 + 3600 };
    assert.equal(getSessions(f.path, singleRange).rows[0].calls, 1);
    assert.deepEqual(getSessions(f.path, singleRange).rows[0].modelNames, ["gpt-6"]);
  } finally { f.cleanup(); }
});

test("builds a local-time weekday and hour heatmap from retained details", () => {
  const f = fixture();
  try {
    const range = parseRange(new URLSearchParams({ from: "1800000000", to: "1800007200", bucket: "1h", offset: "28800" }), {});
    const result = getHeatmap(f.path, range);
    assert.equal(result.available, true);
    assert.equal(result.detailOnly, true);
    assert.equal(result.rows.reduce((sum, row) => sum + row.calls, 0), 3);
    assert.ok(result.rows.every((row) => row.weekday >= 0 && row.weekday <= 6 && row.hour >= 0 && row.hour <= 23));
  } finally { f.cleanup(); }
});

test("an empty but valid database stays usable", () => {
  const f = fixture();
  try {
    const db = new DatabaseSync(f.path);
    db.exec("DELETE FROM proxy_request_logs");
    db.close();
    const meta = getMeta(f.path);
    assert.equal(meta.available, true);
    assert.equal(meta.empty, true);
    assert.equal(meta.count, 0);
    assert.ok(meta.first < meta.last);
    const range = parseRange(new URLSearchParams({ from: String(meta.first), to: String(meta.last + 1), bucket: "1d" }), {});
    assert.equal(getSeries(f.path, range).totals.calls, 0);
    assert.equal(getReport(f.path, range, "all").current.activeDays, 0);
  } finally { f.cleanup(); }
});


test("supports databases without optional request and status columns", () => {
  const f = optionalColumnsFixture();
  try {
    const range = parseRange(
      new URLSearchParams("from=1800000000&to=1800007200&bucket=1h&modelMode=requested"),
      {},
    );
    const series = getSeries(f.path, range);
    assert.equal(series.rows[0].model, "glm-5");
    const requests = getRequests(f.path, range);
    assert.equal(requests[0].inputTokens, 0);
    assert.equal(requests[0].outputTokens, 10);
    assert.equal(requests[0].status, null);
  } finally {
    f.cleanup();
  }
});

test("rejects an incomplete archive table with a schema error", () => {
  const f = fixture();
  try {
    const db = new DatabaseSync(f.path);
    db.exec(`CREATE TABLE usage_daily_rollups (
      date TEXT, model TEXT, request_count INTEGER, input_tokens INTEGER,
      output_tokens INTEGER, total_cost_usd TEXT
    )`);
    db.close();
    assert.throws(
      () => getMeta(f.path),
      /usage_daily_rollups is missing cache_read_tokens/,
    );
  } finally {
    f.cleanup();
  }
});
