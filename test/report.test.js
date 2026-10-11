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
});
