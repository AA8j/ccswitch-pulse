import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export const defaultDbPath = () =>
  join(homedir(), ".cc-switch", "cc-switch.db");
const REQUIRED_COLUMNS = [
  "created_at",
  "model",
  "request_model",
  "data_source",
  "input_tokens",
  "output_tokens",
  "cache_read_tokens",
  "cache_creation_tokens",
  "total_cost_usd",
];
const BUCKETS = [300, 900, 3600, 86400, 604800];

export function chooseBucket(from, to, requested = "auto") {
  const aliases = {
    "5m": 300,
    "15m": 900,
    "1h": 3600,
    "1d": 86400,
    "1w": 604800,
  };
  if (requested !== "auto" && !(requested in aliases))
    throw new RangeError("Unsupported time granularity");
  const bucket =
    requested === "auto"
      ? BUCKETS.find((value) => (to - from) / value <= 180) || 604800
      : aliases[requested];
  if ((to - from) / bucket > 720)
    throw new RangeError("Too many time buckets; choose a coarser granularity");
  return bucket;
}

export function parseRange(searchParams, fallback) {
  const from = Number(searchParams.get("from") ?? fallback.from);
  const to = Number(searchParams.get("to") ?? fallback.to);
  const source = searchParams.get("source") || "all";
  const modelMode = searchParams.get("modelMode") || "actual";
  const offset = Number(searchParams.get("offset") || 0);
  if (
    !Number.isSafeInteger(from) ||
    !Number.isSafeInteger(to) ||
    to <= from ||
    to - from > 5 * 366 * 86400
  )
    throw new RangeError("Invalid time range");
  if (source !== "all" && !/^[a-z][a-z0-9_]{0,39}$/.test(source))
    throw new RangeError("Invalid data source");
  if (!["actual", "requested"].includes(modelMode))
    throw new RangeError("Invalid model mode");
  if (!Number.isInteger(offset) || offset < -50400 || offset > 50400)
    throw new RangeError("Invalid time zone offset");
  return {
    from,
    to,
    source,
    modelMode,
    offset,
    bucket: chooseBucket(from, to, searchParams.get("bucket") || "auto"),
  };
}

export function withDb(dbPath, callback) {
  if (!existsSync(dbPath)) return null;
  const db = new DatabaseSync(dbPath, { readOnly: true, timeout: 1500 });
  try {
    const columns = db
      .prepare("PRAGMA table_info(proxy_request_logs)")
      .all()
      .map((row) => row.name);
    const missing = REQUIRED_COLUMNS.filter(
      (column) => !columns.includes(column),
    );
    if (missing.length)
      throw new Error(
        `Unsupported CC Switch database schema; missing ${missing.join(", ")}`,
      );
    db.exec("PRAGMA query_only = ON");
    return callback(db);
  } finally {
    db.close();
  }
}

export function getMeta(dbPath) {
  const result = withDb(dbPath, (db) => {
    const stats = db
      .prepare(
        "SELECT COUNT(*) AS count, MIN(created_at) AS first, MAX(created_at) AS last FROM proxy_request_logs",
      )
      .get();
    const sources = db
      .prepare(
        "SELECT data_source AS id, COUNT(*) AS count FROM proxy_request_logs GROUP BY data_source ORDER BY count DESC",
      )
      .all();
    return {
      available: true,
      count: stats.count,
      first: stats.first,
      last: stats.last,
      sources,
    };
  });
  return (
    result || {
      available: false,
      count: 0,
      first: null,
      last: null,
      sources: [],
    }
  );
}

function clauses(range) {
  return {
    where: `created_at >= ? AND created_at < ?${range.source === "all" ? "" : " AND data_source = ?"}`,
    args:
      range.source === "all"
        ? [range.from, range.to]
        : [range.from, range.to, range.source],
    model:
      range.modelMode === "requested"
        ? "COALESCE(NULLIF(request_model, ''), model)"
        : "model",
  };
}

export function getSeries(dbPath, range) {
  return withDb(dbPath, (db) => {
    const { where, args, model } = clauses(range);
    const sql = `SELECT (CAST((created_at + ?) / ? AS INTEGER) * ? - ?) AS bucket,
      ${model} AS model, COUNT(*) AS calls,
      SUM(input_tokens + output_tokens + cache_read_tokens + cache_creation_tokens) AS tokens,
      ROUND(SUM(CAST(total_cost_usd AS REAL)), 6) AS cost
      FROM proxy_request_logs WHERE ${where} GROUP BY bucket, model ORDER BY bucket, model`;
    const rows = db
      .prepare(sql)
      .all(range.offset, range.bucket, range.bucket, range.offset, ...args);
    const totals = db
      .prepare(
        `SELECT COUNT(*) AS calls,
      SUM(input_tokens + output_tokens + cache_read_tokens + cache_creation_tokens) AS tokens,
      ROUND(SUM(CAST(total_cost_usd AS REAL)), 6) AS cost,
      COUNT(DISTINCT ${model}) AS models FROM proxy_request_logs WHERE ${where}`,
      )
      .get(...args);
    return {
      range,
      rows,
      totals: {
        calls: totals.calls,
        tokens: totals.tokens || 0,
        cost: totals.cost || 0,
        models: totals.models,
      },
    };
  });
}

export function getRequests(dbPath, range, limit = 24) {
  return withDb(dbPath, (db) => {
    const { where, args, model } = clauses(range);
    const sql = `SELECT created_at AS time, ${model} AS model, data_source AS source,
      (input_tokens + cache_read_tokens + cache_creation_tokens) AS inputTokens, output_tokens AS outputTokens,
      ROUND(CAST(total_cost_usd AS REAL), 6) AS cost, status_code AS status
      FROM proxy_request_logs WHERE ${where} ORDER BY created_at DESC LIMIT ?`;
    return db.prepare(sql).all(...args, Math.max(1, Math.min(100, limit)));
  });
}
