import { getSeries } from "./data.js";

export function summarize(series) {
  const byDay = new Map();
  const byModel = new Map();
  for (const row of series.rows) {
    byDay.set(row.bucket, (byDay.get(row.bucket) || 0) + row.calls);
    byModel.set(row.model, (byModel.get(row.model) || 0) + row.calls);
  }
  const days = [...byDay].sort((a, b) => a[0] - b[0]);
  const models = [...byModel]
    .map(([model, calls]) => ({ model, calls, share: series.totals.calls ? calls / series.totals.calls : 0 }))
    .sort((a, b) => b.calls - a.calls || a.model.localeCompare(b.model));
  const peak = [...days].sort((a, b) => b[1] - a[1])[0];
  const offset = Number(series.range.offset || 0);
  const firstCalendarDay = Math.floor((series.range.from + offset) / 86400);
  const lastCalendarDay = Math.floor((series.range.to - 1 + offset) / 86400);
  const periodDays = Math.max(1, lastCalendarDay - firstCalendarDay + 1);
  return {
    ...series.totals,
    activeDays: days.filter(([, calls]) => calls > 0).length,
    peak: peak ? { time: peak[0], calls: peak[1] } : null,
    models,
    periodDays,
    averageDaily: Math.round(series.totals.calls / periodDays),
    concentration: models[0]?.share || 0,
    days: days.map(([time, calls]) => ({ time, calls })),
  };
}

function delta(current, previous) {
  return previous ? (current - previous) / previous : null;
}

export function getReport(dbPath, range, period = "custom", compare = null) {
  const daily = { ...range, bucket: 86400 };
  const currentSeries = getSeries(dbPath, daily);
  const current = summarize(currentSeries);
  let previous = null;
  if (period !== "all") {
    const duration = range.to - range.from;
    const previousRange = compare
      ? { ...daily, from: compare.from, to: compare.to }
      : { ...daily, from: range.from - duration, to: range.from };
    previous = summarize(getSeries(dbPath, previousRange));
  }
  return {
    period,
    range,
    current,
    previous,
    changes: previous ? {
      calls: delta(current.calls, previous.calls),
      tokens: delta(current.tokens, previous.tokens),
      cost: delta(current.cost, previous.cost),
    } : null,
    coverage: currentSeries.coverage,
  };
}
