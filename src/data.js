import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export const defaultDbPath = () =>
  join(homedir(), ".cc-switch", "cc-switch.db");
const REQUIRED_COLUMNS = [
  "created_at",
  "model",
  "data_source",
  "input_tokens",
  "output_tokens",
  "cache_read_tokens",
  "cache_creation_tokens",
  "total_cost_usd",
];
const ROLLUP_REQUIRED_COLUMNS = [
  "date",
  "model",
  "request_count",
  "input_tokens",
  "output_tokens",
  "cache_read_tokens",
  "cache_creation_tokens",
  "total_cost_usd",
];
const BUCKETS = [300, 900, 3600, 86400, 604800];
const WEEK_ORIGIN = 345600; // Monday 1970-01-05 in the local calendar.

function bucketExpression(value, bucket, offset, weekly = false) {
  const origin = weekly ? WEEK_ORIGIN : 0;
  return `CAST((${value} + ${offset} - ${origin}) / ${bucket} AS INTEGER) * ${bucket} + ${origin} - ${offset}`;
}

function localDay(seconds, offset) {
  return new Date((seconds + offset) * 1000).toISOString().slice(0, 10);
}

function nextDay(day) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
}

function tableColumns(db, table) {
  return db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((row) => row.name);
}

function hasRollups(db) {
  const columns = tableColumns(db, "usage_daily_rollups");
  return columns.length > 0 && ROLLUP_REQUIRED_COLUMNS.every((column) => columns.includes(column));
}

function validateRollupSchema(db) {
  const columns = tableColumns(db, "usage_daily_rollups");
  if (!columns.length) return;
  const missing = ROLLUP_REQUIRED_COLUMNS.filter((column) => !columns.includes(column));
  if (missing.length)
    throw new Error(
      `Unsupported CC Switch database schema; usage_daily_rollups is missing ${missing.join(", ")}`,
    );
}

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
    const columns = tableColumns(db, "proxy_request_logs");
    const missing = REQUIRED_COLUMNS.filter(
      (column) => !columns.includes(column),
    );
    if (missing.length)
      throw new Error(
        `Unsupported CC Switch database schema; missing ${missing.join(", ")}`,
      );
    validateRollupSchema(db);
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
    const rollupsAvailable = hasRollups(db);
    const rollup = rollupsAvailable
      ? db.prepare("SELECT MIN(date) AS first, MAX(date) AS last FROM usage_daily_rollups").get()
      : { first: null, last: null };
    const sources = db
      .prepare(
        "SELECT data_source AS id, COUNT(*) AS count, MIN(created_at) AS first, MAX(created_at) AS last FROM proxy_request_logs GROUP BY data_source ORDER BY count DESC",
      )
      .all();
    const rollupFirst = rollup.first ? Math.floor(new Date(`${rollup.first}T00:00:00`).getTime() / 1000) : null;
    const rollupLast = rollup.last ? Math.floor(new Date(`${rollup.last}T23:59:59`).getTime() / 1000) : null;
    const historicalCount = rollupsAvailable
      ? db.prepare("SELECT COALESCE(SUM(request_count), 0) AS count FROM usage_daily_rollups").get().count
      : 0;
    const empty = stats.count + historicalCount === 0;
    const now = Math.floor(Date.now() / 1000);
    return {
      available: true,
      empty,
      count: stats.count + historicalCount,
      first: empty ? now - 7 * 86400 : rollupFirst == null ? stats.first : Math.min(stats.first ?? rollupFirst, rollupFirst),
      last: empty ? now : rollupLast == null ? stats.last : Math.max(stats.last ?? rollupLast, rollupLast),
      rawFirst: stats.first,
      rollupFirst,
      hasRollups: Boolean(rollup.first),
      sources,
    };
  });
  return (
    result || {
      available: false,
      empty: false,
      count: 0,
      first: null,
      last: null,
      rawFirst: null,
      rollupFirst: null,
      hasRollups: false,
      sources: [],
    }
  );
}

function clauses(range, columns = []) {
  return {
    where: `created_at >= ? AND created_at < ?${range.source === "all" ? "" : " AND data_source = ?"}`,
    args:
      range.source === "all"
        ? [range.from, range.to]
        : [range.from, range.to, range.source],
    model:
      range.modelMode === "requested" && columns.includes("request_model")
        ? "COALESCE(NULLIF(request_model, ''), model)"
        : "model",
    status: columns.includes("status_code") ? "status_code" : "NULL",
  };
}

export function getSeries(dbPath, range) {
  return withDb(dbPath, (db) => {
    const columns = tableColumns(db, "proxy_request_logs");
    const { where, args, model } = clauses(range, columns);
    const rawFirst = db.prepare("SELECT MIN(created_at) AS first FROM proxy_request_logs").get().first;
    const rawBucket = bucketExpression("created_at", "?", "?", range.bucket === 604800);
    const rawSql = `SELECT ${rawBucket} AS bucket, ${model} AS model,
      COUNT(*) AS calls,
      SUM(COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0) +
        COALESCE(cache_read_tokens, 0) + COALESCE(cache_creation_tokens, 0)) AS tokens,
      SUM(COALESCE(CAST(total_cost_usd AS REAL), 0)) AS cost
      FROM proxy_request_logs WHERE ${where} GROUP BY bucket, model`;
    const rawArgs = [range.offset, range.bucket, range.bucket, range.offset, ...args];
    let rollupSql = "";
    let rollupArgs = [];
    let rollupThrough = null;
    let historicalCalls = 0;
    if (range.source === "all" && hasRollups(db)) {
      rollupThrough = db.prepare("SELECT MAX(date) AS last FROM usage_daily_rollups").get().last;
      const daySeconds = "CAST(strftime('%s', date || ' 00:00:00') AS INTEGER)";
      const bucket = bucketExpression(`${daySeconds} - ?`, "?", "?", range.bucket === 604800);
      const rollupColumns = db.prepare("PRAGMA table_info(usage_daily_rollups)").all().map((row) => row.name);
      const rollupModel = range.modelMode === "requested" && rollupColumns.includes("request_model")
        ? "COALESCE(NULLIF(request_model, ''), model)" : "model";
      const fromDay = localDay(range.from, range.offset);
      const firstFullDay = (range.from + range.offset) % 86400 === 0 ? fromDay : nextDay(fromDay);
      const endDay = localDay(range.to, range.offset);
      rollupSql = ` UNION ALL SELECT ${bucket} AS bucket, ${rollupModel} AS model,
        SUM(request_count) AS calls,
        SUM(COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0) +
          COALESCE(cache_read_tokens, 0) + COALESCE(cache_creation_tokens, 0)) AS tokens,
        SUM(COALESCE(CAST(total_cost_usd AS REAL), 0)) AS cost
        FROM usage_daily_rollups WHERE date >= ? AND date < ? GROUP BY bucket, model`;
      rollupArgs = [range.offset, range.offset, range.bucket, range.bucket, range.offset,
        firstFullDay, endDay];
      historicalCalls = db.prepare("SELECT COALESCE(SUM(request_count), 0) AS calls FROM usage_daily_rollups WHERE date >= ? AND date < ?")
        .get(firstFullDay, endDay).calls;
    }
    const rows = db.prepare(`SELECT bucket, model, SUM(calls) AS calls, SUM(tokens) AS tokens,
      ROUND(SUM(cost), 6) AS cost FROM (${rawSql}${rollupSql})
      GROUP BY bucket, model ORDER BY bucket, model`).all(...rawArgs, ...rollupArgs);
    const totals = rows.reduce((total, row) => ({
      calls: total.calls + row.calls,
      tokens: total.tokens + row.tokens,
      cost: total.cost + row.cost,
    }), { calls: 0, tokens: 0, cost: 0 });
    return {
      range,
      rows,
      totals: {
        calls: totals.calls,
        tokens: totals.tokens || 0,
        cost: Math.round(totals.cost * 1e6) / 1e6,
        models: new Set(rows.map((row) => row.model)).size,
      },
      coverage: { rawFirst, rollupThrough, historicalIncluded: historicalCalls > 0, historicalCalls },
    };
  });
}

export function getSessions(dbPath, range, limit = 12) {
  return withDb(dbPath, (db) => {
    const columns = tableColumns(db, "proxy_request_logs");
    if (!columns.includes("session_id")) return { available: false, rows: [] };
    const model =
      range.modelMode === "requested" && columns.includes("request_model")
        ? "COALESCE(NULLIF(request_model, ''), model)"
        : "model";
    const source = range.source === "all" ? "" : " AND data_source = ?";
    const args = range.source === "all" ? [] : [range.source];
    const rows = db.prepare(`SELECT MIN(created_at) AS first, MAX(created_at) AS last,
      COUNT(*) AS calls, COUNT(DISTINCT ${model}) AS models,
      SUM(COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0) +
        COALESCE(cache_read_tokens, 0) + COALESCE(cache_creation_tokens, 0)) AS tokens,
      ROUND(SUM(COALESCE(CAST(total_cost_usd AS REAL), 0)), 6) AS cost,
      GROUP_CONCAT(DISTINCT ${model}) AS model_names
      FROM proxy_request_logs WHERE created_at >= ? AND created_at < ?
      AND data_source LIKE '%_session' AND session_id IS NOT NULL AND session_id <> ''${source}
      GROUP BY data_source, session_id ORDER BY last DESC LIMIT ?`).all(range.from, range.to, ...args, Math.max(1, Math.min(50, limit)));
    return { available: true, rows: rows.map((row) => ({
      ...row,
      modelNames: String(row.model_names || "").split(",").filter(Boolean),
    })) };
  });
}

export function getHeatmap(dbPath, range) {
  return withDb(dbPath, (db) => {
    const source = range.source === "all" ? "" : " AND data_source = ?";
    const args = range.source === "all" ? [range.offset, range.offset, range.from, range.to] : [range.offset, range.offset, range.from, range.to, range.source];
    const rows = db.prepare(`SELECT
      CAST(strftime('%w', created_at + ?, 'unixepoch') AS INTEGER) AS weekday,
      CAST(strftime('%H', created_at + ?, 'unixepoch') AS INTEGER) AS hour,
      COUNT(*) AS calls,
      SUM(COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0) +
        COALESCE(cache_read_tokens, 0) + COALESCE(cache_creation_tokens, 0)) AS tokens,
      ROUND(SUM(COALESCE(CAST(total_cost_usd AS REAL), 0)), 6) AS cost
      FROM proxy_request_logs
      WHERE created_at >= ? AND created_at < ?${source}
      GROUP BY weekday, hour
      ORDER BY weekday, hour`).all(...args);
    return { available: true, rows, detailOnly: true };
  });
}

export function getRequests(dbPath, range, limit = 24) {
  return withDb(dbPath, (db) => {
    const columns = tableColumns(db, "proxy_request_logs");
    const { where, args, model, status } = clauses(range, columns);
    const sql = `SELECT created_at AS time, ${model} AS model, data_source AS source,
      (COALESCE(input_tokens, 0) + COALESCE(cache_read_tokens, 0) +
        COALESCE(cache_creation_tokens, 0)) AS inputTokens,
      COALESCE(output_tokens, 0) AS outputTokens,
      ROUND(COALESCE(CAST(total_cost_usd AS REAL), 0), 6) AS cost, ${status} AS status
      FROM proxy_request_logs WHERE ${where} ORDER BY created_at DESC LIMIT ?`;
    return db.prepare(sql).all(...args, Math.max(1, Math.min(100, limit)));
  });
}
