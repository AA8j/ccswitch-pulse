import { summarize } from "./report.js";

// The demo profile is derived from an aggregated local usage shape:
// model names and relative usage patterns are representative, while every
// timestamp, count, cost, and token total is synthetic and reproducible.
const MODEL_PROFILES = [
  { name: "deepseek-flash", weight: 15.0, tokens: 4200, cost: 0.006 },
  { name: "gpt-6-astra", weight: 5.7, tokens: 2800, cost: 0.082 },
  { name: "gpt-6-sol", weight: 3.1, tokens: 2600, cost: 0.036 },
  { name: "gpt-6.1-sol", weight: 2.6, tokens: 3000, cost: 0.033 },
  { name: "gpt-5.6-luna", weight: 1.5, tokens: 2200, cost: 0.012 },
  { name: "codex-auto-review", weight: 1.1, tokens: 1800, cost: 0.001 },
  { name: "gpt-5.6-sol", weight: 0.9, tokens: 2500, cost: 0.025 },
  { name: "deepseek-v4-pro", weight: 0.74, tokens: 3000, cost: 0.014 },
  { name: "glm-5.3", weight: 0.15, tokens: 2700, cost: 0.022 },
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

function sourceFor(index, profile) {
  if (profile.name === "codex-auto-review") return "codex_session";
  return index % 5 === 0 ? "codex_session" : "proxy";
}

function requestModelFor(name) {
  if (name === "gpt-6.1-sol") return "gpt-6-sol";
  if (name === "gpt-5.6-sol") return "gpt-6-sol";
  return name;
}

function pushRecord({ time, profile, index, calls, historical }) {
  if (calls <= 0) return;
  records.push({
    time,
    model: profile.name,
    requestModel: requestModelFor(profile.name),
    source: sourceFor(index, profile),
    calls,
    tokens: calls * profile.tokens,
    cost: calls * profile.cost,
    historical,
  });
}

for (let day = historicalStart; day < start; day += DAY) {
  const index = Math.floor((day - historicalStart) / DAY);
  const weekday = new Date(day * 1000).getUTCDay();
  const cycle = 0.72 + Math.sin(index * 0.19) * 0.2 + Math.cos(index * 0.047) * 0.12;
  const weekend = weekday === 0 || weekday === 6 ? 0.48 : 1;
  const quiet = index % 37 === 0 || index % 53 === 0 ? 0.18 : 1;
  for (const [profileIndex, profile] of MODEL_PROFILES.entries()) {
    const modelWave = 1 + Math.sin(index * 0.13 + profileIndex * 1.7) * 0.18;
    const calls = Math.round(profile.weight * 18 * cycle * weekend * quiet * modelWave);
    pushRecord({ time: day + 12 * HOUR, profile, index: profileIndex, calls, historical: true });
  }
}

for (let hour = start; hour < end; hour += HOUR) {
  const date = new Date(hour * 1000);
  const hourOfDay = date.getUTCHours();
  const day = Math.floor((hour - start) / DAY);
  const weekday = date.getUTCDay();
  const workWindow = hourOfDay >= 8 && hourOfDay <= 23 ? 1 : 0.16;
  const weekend = weekday === 0 || weekday === 6 ? 0.42 : 1;
  const dayWave = 0.82 + Math.sin(day * 0.61) * 0.18 + Math.cos(day * 0.17) * 0.1;
  const burst =
    day === 16 && hourOfDay >= 13 && hourOfDay <= 18
      ? 2.7
      : day === 24 && hourOfDay >= 9 && hourOfDay <= 12
        ? 1.9
        : day === 28 && hourOfDay >= 19 && hourOfDay <= 22
          ? 1.55
          : 1;
  for (const [profileIndex, profile] of MODEL_PROFILES.entries()) {
    const modelWave = 1 + Math.sin(day * 0.37 + profileIndex * 1.31) * 0.22;
    const calls = Math.round(
      profile.weight * 0.95 * workWindow * weekend * dayWave * burst * modelWave,
    );
    pushRecord({ time: hour, profile, index: profileIndex, calls, historical: false });
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
    const model = range.modelMode === "requested" ? row.requestModel : row.model;
    const origin = range.bucket === 604800 ? 345600 : 0;
    const time =
      Math.floor((row.time + range.offset - origin) / range.bucket) * range.bucket +
      origin -
      range.offset;
    const key = `${time}\u0000${model}`;
    const entry = grouped.get(key) || { bucket: time, model, calls: 0, tokens: 0, cost: 0 };
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
    rows: [...grouped.values()].sort((a, b) => a.bucket - b.bucket || a.model.localeCompare(b.model)),
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
  const change = (key) => previous?.[key] ? (current[key] - previous[key]) / previous[key] : null;
  return {
    period,
    range,
    current,
    previous,
    changes: previous ? { calls: change("calls"), tokens: change("tokens"), cost: change("cost") } : null,
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
    const entry = sessions.get(day) || { first: row.time, last: row.time, calls: 0, tokens: 0, cost: 0, names: new Set() };
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
    rows: [...sessions.values()].sort((a, b) => b.last - a.last).slice(0, 12).map(({ names, ...row }) => ({
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
    const entry = cells.get(key) || { weekday, hour, calls: 0, tokens: 0, cost: 0 };
    entry.calls += row.calls;
    entry.tokens += row.tokens;
    entry.cost += row.cost;
    cells.set(key, entry);
  }
  return {
    available: true,
    rows: [...cells.values()].sort((a, b) => a.weekday - b.weekday || a.hour - b.hour),
    detailOnly: true,
  };
}
