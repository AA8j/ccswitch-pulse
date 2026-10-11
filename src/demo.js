import { summarize } from "./report.js";

const NAMES = [
  "GPT · Flagship",
  "Claude · Sonnet",
  "Gemini · Pro",
  "GLM · Coding",
  "Kimi · Thinking",
  "DeepSeek · Reasoner",
];
const HOUR = 3600;
const DAY = 86400;
const DEFAULT_END = Math.floor(Date.UTC(2026, 9, 11, 13, 0, 0) / 1000);

function demoEnd() {
  const value = Number(process.env.CCSWITCH_PULSE_DEMO_END ?? DEFAULT_END);
  return Number.isSafeInteger(value) && value > 0 ? value : DEFAULT_END;
}

const end = demoEnd();
const start = end - 30 * DAY;
const historicalStart = start - 335 * DAY;
const records = [];

for (let day = historicalStart; day < start; day += DAY) {
  const index = Math.floor((day - historicalStart) / DAY);
  const weekday = new Date(day * 1000).getUTCDay();
  const rhythm = weekday === 0 || weekday === 6 ? 0.48 : 1;
  for (let i = 0; i < NAMES.length; i++) {
    const migration = i === 0 ? 0.7 + index / 420 : i === 1 ? 1.3 - index / 1000 : 1;
    const wave = 1 + Math.sin(index * 0.115 + i * 1.3) * 0.17;
    const calls = Math.max(1, Math.round((176 - i * 14) * rhythm * migration * wave));
    records.push({
      time: day + 12 * HOUR,
      model: NAMES[i],
      requestModel: i === 4 ? "Claude · Sonnet" : NAMES[i],
      source: i % 3 === 0 ? "codex_session" : "proxy",
      calls,
      tokens: calls * (1750 + i * 440),
      cost: calls * (0.028 + i * 0.012),
      historical: true,
    });
  }
}

for (let hour = start; hour < end; hour += HOUR) {
  const h = new Date(hour * 1000).getUTCHours();
  const day = Math.floor((hour - start) / DAY);
  for (let i = 0; i < NAMES.length; i++) {
    const wave =
      Math.sin(day * 0.53 + i * 1.7) * 0.35 + Math.cos(h * 0.37 + i) * 0.22;
    const work = h >= 9 && h <= 22 ? 1 : 0.28;
    const pulse = day === 12 && h >= 13 && h <= 19 && i === 1 ? 2.4 : 1;
    const calls = Math.max(
      0,
      Math.round((13 - i * 1.45) * work * (1 + wave) * pulse),
    );
    if (!calls) continue;
    records.push({
      time: hour,
      model: NAMES[i],
      requestModel: i === 4 ? "Claude · Sonnet" : NAMES[i],
      source: i % 3 === 0 ? "codex_session" : "proxy",
      calls,
      tokens: calls * (1850 + i * 520),
      cost: calls * (0.031 + i * 0.014),
      historical: false,
    });
  }
}

function localDateKey(seconds, offset = 0) {
  return new Date((seconds + offset) * 1000).toISOString().slice(0, 10);
}

function demoSourceMeta(id) {
  const rows = records.filter((row) => !row.historical && row.source === id);
  return {
    id,
    count: rows.reduce((sum, row) => sum + row.calls, 0),
    first: rows.length ? Math.min(...rows.map((row) => row.time)) : null,
    last: rows.length ? Math.max(...rows.map((row) => row.time)) : null,
  };
}

export function getDemoMeta() {
  return {
    available: true,
    demo: true,
    empty: false,
    count: records.reduce((sum, row) => sum + row.calls, 0),
    first: historicalStart,
    last: end - 1,
    rawFirst: start,
    rollupFirst: historicalStart,
    hasRollups: true,
    sources: [demoSourceMeta("proxy"), demoSourceMeta("codex_session")],
  };
}

export function getDemoSeries(range) {
  const grouped = new Map();
  const totals = { calls: 0, tokens: 0, cost: 0, models: 0 };
  const models = new Set();
  const historicalRows = [];
  for (const row of records) {
    if (
      row.time < range.from ||
      row.time >= range.to ||
      (row.historical && range.source !== "all") ||
      (!row.historical && range.source !== "all" && row.source !== range.source)
    )
      continue;
    if (row.historical) historicalRows.push(row);
    const model =
      range.modelMode === "requested" ? row.requestModel : row.model;
    const origin = range.bucket === 604800 ? 345600 : 0;
    const time =
      Math.floor((row.time + range.offset - origin) / range.bucket) *
        range.bucket +
      origin -
      range.offset;
    const key = `${time}\u0000${model}`;
    const entry = grouped.get(key) || {
      bucket: time,
      model,
      calls: 0,
      tokens: 0,
      cost: 0,
    };
    entry.calls += row.calls;
    entry.tokens += row.tokens;
    entry.cost += row.cost;
    grouped.set(key, entry);
    totals.calls += row.calls;
    totals.tokens += row.tokens;
    totals.cost += row.cost;
    models.add(model);
  }
  totals.models = models.size;
  totals.cost = Math.round(totals.cost * 1e6) / 1e6;
  return {
    range,
    rows: [...grouped.values()].sort(
      (a, b) => a.bucket - b.bucket || a.model.localeCompare(b.model),
    ),
    totals,
    coverage: {
      rawFirst: start,
      rollupThrough: localDateKey(start - 1, range.offset),
      historicalIncluded: historicalRows.length > 0,
      historicalCalls: historicalRows.reduce((sum, row) => sum + row.calls, 0),
    },
  };
}

export function getDemoRequests(range) {
  return records
    .filter(
      (row) =>
        !row.historical &&
        row.time >= range.from &&
        row.time < range.to &&
        (range.source === "all" || row.source === range.source),
    )
    .slice(-24)
    .reverse()
    .map((row) => ({
      time: row.time,
      model: range.modelMode === "requested" ? row.requestModel : row.model,
      source: row.source,
      inputTokens: Math.round(row.tokens * 0.82),
      outputTokens: Math.round(row.tokens * 0.18),
      cost: Math.round(row.cost * 1e6) / 1e6,
      status: 200,
      calls: row.calls,
      aggregate: true,
    }));
}

export function getDemoReport(range, period = "custom", compare = null) {
  const daily = { ...range, bucket: 86400 };
  const currentSeries = getDemoSeries(daily);
  const current = summarize(currentSeries);
  const compareRange = compare
    ? { ...daily, from: compare.from, to: compare.to }
    : { ...daily, from: range.from - (range.to - range.from), to: range.from };
  const previous = period === "all" ? null : summarize(getDemoSeries(compareRange));
  const change = (key) =>
    previous?.[key] ? (current[key] - previous[key]) / previous[key] : null;
  return {
    period,
    range,
    current,
    previous,
    changes: previous
      ? { calls: change("calls"), tokens: change("tokens"), cost: change("cost") }
      : null,
    coverage: currentSeries.coverage,
  };
}

export function getDemoSessions(range) {
  const sessions = new Map();
  for (const row of records) {
    if (
      row.historical ||
      row.source !== "codex_session" ||
      row.time < range.from ||
      row.time >= range.to ||
      (range.source !== "all" && range.source !== "codex_session")
    )
      continue;
    const day = localDateKey(row.time, range.offset);
    const model = range.modelMode === "requested" ? row.requestModel : row.model;
    const entry = sessions.get(day) || {
      first: row.time,
      last: row.time,
      calls: 0,
      tokens: 0,
      cost: 0,
      names: new Set(),
    };
    entry.first = Math.min(entry.first, row.time);
    entry.last = Math.max(entry.last, row.time);
    entry.calls += row.calls;
    entry.tokens += row.tokens;
    entry.cost += row.cost;
    entry.names.add(model);
    sessions.set(day, entry);
  }
  return {
    available: true,
    rows: [...sessions.values()]
      .sort((a, b) => b.last - a.last)
      .slice(0, 12)
      .map(({ names, ...row }) => ({
        ...row,
        models: names.size,
        modelNames: [...names],
        cost: Math.round(row.cost * 1e6) / 1e6,
      })),
  };
}

export function getDemoHeatmap(range) {
  const cells = new Map();
  for (const row of records) {
    if (
      row.historical ||
      row.time < range.from ||
      row.time >= range.to ||
      (range.source !== "all" && row.source !== range.source)
    )
      continue;
    const local = new Date((row.time + range.offset) * 1000);
    const weekday = local.getUTCDay();
    const hour = local.getUTCHours();
    const key = `${weekday}\u0000${hour}`;
    const entry =
      cells.get(key) || { weekday, hour, calls: 0, tokens: 0, cost: 0 };
    entry.calls += row.calls;
    entry.tokens += row.tokens;
    entry.cost += row.cost;
    cells.set(key, entry);
  }
  return {
    available: true,
    rows: [...cells.values()].sort(
      (a, b) => a.weekday - b.weekday || a.hour - b.hour,
    ),
    detailOnly: true,
  };
}
