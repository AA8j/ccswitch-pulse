import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  getMeta,
  getRequests,
  getSeries,
  getSessions,
  parseRange,
} from "../src/data.js";

function realShapeFixture() {
  const dir = mkdtempSync(join(tmpdir(), "ccswitch-pulse-schema-"));
  const path = join(dir, "cc-switch.db");
  const db = new DatabaseSync(path);
  db.exec(readFileSync(new URL("./fixtures/cc-switch-schema.sql", import.meta.url), "utf8"));
  db.prepare(`INSERT INTO proxy_request_logs (
    request_id, provider_id, app_type, model, request_model,
    input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens,
    total_cost_usd, status_code, session_id, created_at, data_source
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run("request-1", "provider-a", "claude", "actual-model", "requested-model", 10, 5, 2, 1, "0.10", 200, "session-1", 1798761600, "claude_session");
  db.prepare(`INSERT INTO usage_daily_rollups (
    date, app_type, provider_id, model, request_model, pricing_model,
    request_count, input_tokens, output_tokens, cache_read_tokens,
    cache_creation_tokens, total_cost_usd
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run("2027-01-01", "claude", "provider-a", "archived-model", "requested-archived", "default", 2, 100, 20, 0, 0, "0.50");
  db.close();
  return { path, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("accepts the sanitized CC Switch schema fixture", () => {
  const fixture = realShapeFixture();
  try {
    const meta = getMeta(fixture.path);
    assert.equal(meta.available, true);
    assert.equal(meta.hasRollups, true);
    assert.equal(meta.count, 3);

    const range = parseRange(
      new URLSearchParams({
        from: String(1798761600 - 86400),
        to: String(1798761600 + 2 * 86400),
        bucket: "1d",
        modelMode: "requested",
      }),
      {},
    );
    const series = getSeries(fixture.path, range);
    assert.equal(series.totals.calls, 3);
    assert.equal(series.totals.tokens, 138);
    assert.equal(series.totals.cost, 0.6);
    assert.ok(series.rows.some((row) => row.model === "requested-model"));
    assert.ok(series.rows.some((row) => row.model === "requested-archived"));

    const requests = getRequests(fixture.path, range);
    assert.deepEqual(Object.keys(requests[0]), [
      "time",
      "model",
      "source",
      "inputTokens",
      "outputTokens",
      "cost",
      "status",
    ]);
    assert.equal(requests[0].model, "requested-model");
    assert.equal(getSessions(fixture.path, range).rows[0].modelNames[0], "requested-model");
  } finally {
    fixture.cleanup();
  }
});
