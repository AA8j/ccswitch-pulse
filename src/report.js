import { getSeries } from "./data.js";

export function summarize(series) {
  const byDay = new Map();
  const byModel = new Map();
  for (const row of series.rows) {
    const day = byDay.get(row.bucket) || { time: row.bucket, calls: 0, tokens: 0, cost: 0 };
    for (const metric of ["calls", "tokens", "cost"]) day[metric] += Number(row[metric] || 0);
    byDay.set(row.bucket, day);
    const model = byModel.get(row.model) || { model: row.model, calls: 0, tokens: 0, cost: 0 };
    for (const metric of ["calls", "tokens", "cost"]) model[metric] += Number(row[metric] || 0);
    byModel.set(row.model, model);
  }
  const days = [...byDay.values()].sort((a, b) => a.time - b.time);
  const models = [...byModel.values()]
    .map((model) => ({ ...model, share: series.totals.calls ? model.calls / series.totals.calls : 0 }))
    .sort((a, b) => b.calls - a.calls || a.model.localeCompare(b.model));
  const peak = [...days].sort((a, b) => b.calls - a.calls)[0];
  const offset = Number(series.range.offset || 0);
  const firstCalendarDay = Math.floor((series.range.from + offset) / 86400);
  const lastCalendarDay = Math.floor((series.range.to - 1 + offset) / 86400);
  const periodDays = Math.max(1, lastCalendarDay - firstCalendarDay + 1);
  return {
    ...series.totals,
    activeDays: days.filter((day) => day.calls > 0).length,
    peak: peak ? { time: peak.time, calls: peak.calls } : null,
    models,
    periodDays,
    averageDaily: Math.round(series.totals.calls / periodDays),
    concentration: models[0]?.share || 0,
    days,
    modelDays: series.rows.map((row) => ({ time: row.bucket, model: row.model, calls: Number(row.calls || 0), tokens: Number(row.tokens || 0) })),
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
