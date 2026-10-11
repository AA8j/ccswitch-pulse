import test from "node:test";
import assert from "node:assert/strict";
import { getDemoHeatmap, getDemoMeta, getDemoSeries } from "../src/demo.js";

test("demo metadata matches the live source contract", () => {
  const meta = getDemoMeta();
  assert.equal(meta.available, true);
  assert.equal(meta.demo, true);
  assert.ok(meta.rawFirst > meta.first);
  assert.equal(meta.hasRollups, true);
  assert.ok(meta.sources.length >= 2);
  for (const source of meta.sources) {
    assert.ok(source.count > 0);
    assert.ok(Number.isSafeInteger(source.first));
    assert.ok(Number.isSafeInteger(source.last));
    assert.ok(source.first <= source.last);
  }
});


test("demo data is stable and keeps archive-only rows out of hourly views", () => {
  const meta = getDemoMeta();
  const expectedEnd = Math.floor(Date.UTC(2026, 9, 11, 13, 0, 0) / 1000);
  assert.equal(meta.last, expectedEnd - 1);
  assert.equal(meta.rawFirst, expectedEnd - 30 * 86400);
  assert.equal(meta.hasRollups, true);

  const range = {
    from: meta.first,
    to: meta.last + 1,
    source: "all",
    modelMode: "actual",
    offset: 8 * 3600,
    bucket: 86400,
  };
  const series = getDemoSeries(range);
  assert.equal(series.coverage.historicalIncluded, true);
  assert.ok(series.coverage.historicalCalls > 0);
  assert.equal(getDemoHeatmap(range).detailOnly, true);
});
