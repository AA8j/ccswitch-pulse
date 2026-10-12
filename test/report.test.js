import test from "node:test";
import assert from "node:assert/strict";
import { summarize } from "../src/report.js";

test("daily average uses the selected calendar span, not only active days", () => {
  const series = {
    range: { from: 1800057600, to: 1800057600 + 7 * 86400, bucket: 86400, offset: 0 },
    rows: [
      { bucket: 1800057600, model: "m", calls: 90, tokens: 900, cost: 1 },
      { bucket: 1800057600 + 4 * 86400, model: "m", calls: 10, tokens: 100, cost: 1 },
    ],
    totals: { calls: 100, tokens: 1000, cost: 2, models: 1 },
  };
  const report = summarize(series);
  assert.equal(report.activeDays, 2);
  assert.equal(report.periodDays, 7);
  assert.equal(report.averageDaily, 14);
  assert.deepEqual(report.days, [
    { time: 1800057600, calls: 90, tokens: 900, cost: 1 },
    { time: 1800057600 + 4 * 86400, calls: 10, tokens: 100, cost: 1 },
  ]);
});

test("daily share totals retain all metrics in chronological order across models", () => {
  const from = 1800057600;
  const report = summarize({
    range: { from, to: from + 3 * 86400, bucket: 86400, offset: 0 },
    rows: [
      { bucket: from + 86400, model: "b", calls: 2, tokens: 200, cost: 0.2 },
      { bucket: from, model: "a", calls: 3, tokens: 900, cost: 0.3 },
      { bucket: from, model: "b", calls: 1, tokens: 100, cost: 0.1 },
    ],
    totals: { calls: 6, tokens: 1200, cost: 0.6, models: 2 },
  });
  assert.deepEqual(report.days.map(({ time, calls, tokens }) => ({ time, calls, tokens })), [
    { time: from, calls: 4, tokens: 1000 },
    { time: from + 86400, calls: 2, tokens: 200 },
  ]);
  assert.equal(report.days.reduce((sum, day) => sum + day.tokens, 0), report.tokens);
  assert.equal(report.days.reduce((sum, day) => sum + day.calls, 0), report.calls);
  assert.ok(Math.abs(report.days.reduce((sum, day) => sum + day.cost, 0) - report.cost) < 1e-10);
  assert.equal(report.models.find((model) => model.model === "a").tokens, 900);
  assert.equal(report.modelDays.reduce((sum, row) => sum + row.tokens, 0), report.tokens);
  assert.equal(report.modelDays.reduce((sum, row) => sum + row.calls, 0), report.calls);
  assert.deepEqual(Object.keys(report.modelDays[0]).sort(), ["calls", "model", "time", "tokens"]);
});
