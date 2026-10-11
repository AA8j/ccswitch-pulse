import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { performance } from "node:perf_hooks";
import { getMeta, getSeries, parseRange } from "../src/data.js";

const rows = Number(process.argv[2] || 100_000);
if (!Number.isSafeInteger(rows) || rows < 1 || rows > 2_000_000)
  throw new Error("Usage: npm run benchmark -- [rows: 1..2000000]");

const dir = mkdtempSync(join(tmpdir(), "ccswitch-pulse-benchmark-"));
const dbPath = join(dir, "benchmark.db");
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE proxy_request_logs (
  created_at INTEGER NOT NULL, model TEXT NOT NULL, request_model TEXT,
  data_source TEXT NOT NULL, input_tokens INTEGER, output_tokens INTEGER,
  cache_read_tokens INTEGER, cache_creation_tokens INTEGER,
  total_cost_usd TEXT, status_code INTEGER, session_id TEXT
)`);
const insert = db.prepare(`INSERT INTO proxy_request_logs
  (created_at, model, request_model, data_source, input_tokens, output_tokens,
   cache_read_tokens, cache_creation_tokens, total_cost_usd, status_code)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const end = 1_800_000_000;
const start = end - 365 * 86400;
db.exec("BEGIN");
for (let i = 0; i < rows; i++) {
  const time = start + Math.floor((i / rows) * (end - start));
  insert.run(time, `model-${i % 12}`, `requested-${i % 8}`, i % 2 ? "proxy" : "codex_session", 100, 40, 20, 0, "0.01", 200);
}
db.exec("COMMIT");
db.close();

try {
  const meta = getMeta(dbPath);
  const cases = [
    ["7d", meta.last - 7 * 86400, meta.last + 1],
    ["365d", meta.first, meta.last + 1],
  ];
  for (const [label, from, to] of cases) {
    const range = parseRange(new URLSearchParams({ from: String(from), to: String(to), bucket: "auto", offset: "0" }), {});
    const started = performance.now();
    const series = getSeries(dbPath, range);
    const elapsedMs = performance.now() - started;
    console.log(JSON.stringify({ label, rows, elapsedMs: Math.round(elapsedMs * 100) / 100, bucket: range.bucket, resultRows: series.rows.length }));
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
