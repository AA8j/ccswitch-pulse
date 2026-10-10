const NAMES = [
  "gpt-5.6",
  "claude-opus-4.8",
  "claude-sonnet-4.7",
  "gemini-3.6-pro",
  "glm-5.1",
  "kimi-k2.5",
];
const HOUR = 3600;
const end = Math.floor(Date.now() / 1000 / HOUR) * HOUR + HOUR;
const start = end - 30 * 86400;
const records = [];

for (let hour = start; hour < end; hour += HOUR) {
  const h = new Date(hour * 1000).getHours();
  const day = Math.floor((hour - start) / 86400);
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
      requestModel: i === 4 ? "claude-sonnet-4.7" : NAMES[i],
      source: i % 3 === 0 ? "codex_session" : "proxy",
      calls,
      tokens: calls * (1850 + i * 520),
      cost: calls * (0.031 + i * 0.014),
    });
  }
}

export function getDemoMeta() {
  return {
    available: true,
    demo: true,
    count: records.reduce((sum, row) => sum + row.calls, 0),
    first: start,
    last: end - 1,
    sources: [
      {
        id: "proxy",
        count: records
          .filter((row) => row.source === "proxy")
          .reduce((sum, row) => sum + row.calls, 0),
      },
      {
        id: "codex_session",
        count: records
          .filter((row) => row.source === "codex_session")
          .reduce((sum, row) => sum + row.calls, 0),
      },
    ],
  };
}

export function getDemoSeries(range) {
  const grouped = new Map();
  const totals = { calls: 0, tokens: 0, cost: 0, models: 0 };
  const models = new Set();
  for (const row of records) {
    if (
      row.time < range.from ||
      row.time >= range.to ||
      (range.source !== "all" && row.source !== range.source)
    )
      continue;
    const model =
      range.modelMode === "requested" ? row.requestModel : row.model;
    const time =
      Math.floor((row.time + range.offset) / range.bucket) * range.bucket -
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
  };
}

export function getDemoRequests(range) {
  return records
    .filter(
      (row) =>
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
    }));
}
