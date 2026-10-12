import { expect, test } from "@playwright/test";

async function waitForDashboard(page) {
  await page.goto("/");
  await expect(page.locator("#db-status")).toContainText(/演示数据已连接|Demo data connected/);
  await expect(page.locator("#kpi-calls")).not.toHaveText("—");
}

async function seriesAfter(page, action) {
  const [response] = await Promise.all([
    page.waitForResponse((response) => new URL(response.url()).pathname === "/api/series" && response.ok()),
    action(),
  ]);
  return response.json();
}

async function expectRanking(page, rows, metric = "calls") {
  const totals = new Map();
  for (const row of rows) totals.set(row.model, (totals.get(row.model) || 0) + Number(row[metric] || 0));
  const expected = [...totals].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10)
    .map(([model, value]) => ({ model, value: Number(value.toFixed(6)) }));
  await expect.poll(() => page.locator(".rank-row").evaluateAll((elements) => elements.map((element) => ({
    model: element.dataset.model,
    value: Number(Number(element.querySelector(".rank-value").dataset.numericValue).toFixed(6)),
  })))).toEqual(expected);
  const total = rows.reduce((sum, row) => sum + Number(row[metric] || 0), 0);
  await expect.poll(async () => Math.abs(Number(await page.locator("#bucket-total").getAttribute("data-numeric-value")) - total)).toBeLessThan(0.000001);
}

function bucketRows(series, index) {
  const { from, offset, bucket } = series.range;
  const origin = bucket === 604800 ? 345600 : 0;
  const first = Math.floor((from + offset - origin) / bucket) * bucket + origin - offset;
  return series.rows.filter((row) => row.bucket === first + index * bucket);
}

test("selected range ranking totals change with all time and every metric, independently of chart visibility", async ({ page }) => {
  const initial = await seriesAfter(page, () => waitForDashboard(page));
  await expect(page.locator('[data-ranking-scope="range"]')).toHaveAttribute("aria-pressed", "true");
  await expectRanking(page, initial.rows);
  const all = await seriesAfter(page, () => page.locator('[data-range="all"]').click());
  expect(all.totals.calls).toBeGreaterThan(initial.totals.calls);
  await expectRanking(page, all.rows);
  await expect(page.locator("#ranking-time")).toHaveText(await page.locator("#range-summary").textContent());
  for (const metric of ["tokens", "cost", "calls"]) {
    await page.locator(`[data-metric="${metric}"]`).click();
    await expectRanking(page, all.rows, metric);
    await expect(page.locator("#ranking-total-label")).toContainText(metric === "tokens" ? /Tokens/ : metric === "cost" ? /费用|cost/ : /调用|Calls/);
  }
  await page.locator('.legend-chip[aria-pressed="true"]').first().click();
  await expectRanking(page, all.rows);
  const outsideTopFive = await page.locator(".rank-row").nth(5).getAttribute("data-model");
  await page.locator(".rank-row").nth(5).press("Enter");
  await expect(page.locator("#model-view-select")).toHaveValue("all");
  await expect(page.locator(".legend-chip").filter({ hasText: outsideTopFive })).toHaveAttribute("aria-pressed", "true");
  await expectRanking(page, all.rows);
  await page.locator("#model-view-select").selectOption("all");
  await expect(page.locator(".rank-row.inactive")).toHaveCount(0);
});

test("replay ranking follows bucket navigation and explicit range totals remain available during replay", async ({ page }) => {
  await waitForDashboard(page);
  const all = await seriesAfter(page, () => page.locator('[data-range="all"]').click());
  await page.locator('[data-ranking-scope="bucket"]').click();
  const last = Number(await page.locator("#scrubber").getAttribute("max"));
  await expectRanking(page, bucketRows(all, last));
  await page.locator("#scrubber").focus();
  await page.locator("#scrubber").press("Home");
  await expectRanking(page, bucketRows(all, 0));
  await expect(page.locator("#play-progress")).toHaveText("0%");
  await page.locator("#step-forward").click();
  await expectRanking(page, bucketRows(all, 1));
  await page.locator(".ranking-pulse-bar").first().click();
  await expectRanking(page, bucketRows(all, 0));
  await page.locator("#play-button").click();
  await expect.poll(() => page.locator("#scrubber").inputValue()).not.toBe("0");
  await expect(page.locator('[data-ranking-scope="bucket"]')).toHaveAttribute("aria-pressed", "true");
  await page.locator('[data-ranking-scope="range"]').click();
  await expectRanking(page, all.rows);
  await page.locator("#play-button").click();
  await expect(page.locator('[data-ranking-scope="range"]')).toHaveAttribute("aria-pressed", "true");
  await expectRanking(page, all.rows);
});

test("ranking resets to range totals on filters and preserves its scope across language and theme changes", async ({ page }) => {
  await waitForDashboard(page);
  for (const range of ["year", "all"]) {
    await page.locator('[data-ranking-scope="bucket"]').click();
    const series = await seriesAfter(page, () => page.locator(`[data-range="${range}"]`).click());
    await expect(page.locator('[data-ranking-scope="range"]')).toHaveAttribute("aria-pressed", "true");
    await expectRanking(page, series.rows);
  }
  for (const [selector, value] of [["#source-select", "proxy"], ["#model-mode", "requested"], ["#bucket-select", "1w"]]) {
    await page.locator('[data-ranking-scope="bucket"]').click();
    const series = await seriesAfter(page, () => page.locator(selector).selectOption(value));
    await expect(page.locator('[data-ranking-scope="range"]')).toHaveAttribute("aria-pressed", "true");
    await expectRanking(page, series.rows);
    await page.locator('[data-ranking-scope="bucket"]').click();
    await page.locator("#scrubber").focus();
    await page.locator("#scrubber").press("Home");
    await expectRanking(page, bucketRows(series, 0));
    await page.locator("#lang-toggle").click();
    await page.locator("#theme-toggle").click();
    await expect(page.locator('[data-ranking-scope="bucket"]')).toHaveAttribute("aria-pressed", "true");
    await expectRanking(page, bucketRows(series, 0));
  }
});

test("empty replay buckets do not retain the previous range ranking or total", async ({ page }) => {
  await waitForDashboard(page);
  await seriesAfter(page, () => page.locator('[data-range="1"]').click());
  const series = await seriesAfter(page, () => page.locator("#bucket-select").selectOption("5m"));
  await expectRanking(page, series.rows);
  await page.locator("#scrubber").focus();
  await page.locator("#scrubber").press("Home");
  await page.locator("#step-forward").click();
  expect(bucketRows(series, 1)).toEqual([]);
  await expectRanking(page, []);
  await expect(page.locator("#ranking-list")).toContainText(/没有调用记录|No calls/);
  await expect(page.locator("#bucket-total")).toHaveText("0");
  await page.locator('[data-ranking-scope="range"]').click();
  await expectRanking(page, series.rows);
});

test("rapid scope and metric switches cannot restore a stale animated total", async ({ page }) => {
  const series = await seriesAfter(page, () => waitForDashboard(page));
  await expectRanking(page, series.rows);
  const rangeText = await page.locator("#bucket-total").innerText();
  await page.evaluate(() => {
    for (let i = 0; i < 6; i++) {
      document.querySelector('[data-ranking-scope="bucket"]').click();
      document.querySelector('[data-metric="cost"]').click();
      document.querySelector('[data-ranking-scope="range"]').click();
      document.querySelector('[data-metric="calls"]').click();
    }
  });
  await expectRanking(page, series.rows);
  // Observe the final rendered text after the 240ms number animation, not only
  // its target dataset; an older callback must not overwrite it later.
  await page.waitForTimeout(300);
  await expect(page.locator("#bucket-total")).toHaveText(rangeText);
});

test("a late failure from an obsolete range cannot replace the current ranking", async ({ page }) => {
  await waitForDashboard(page);
  let releaseFailure;
  const failureReleased = new Promise((resolve) => { releaseFailure = resolve; });
  await page.route("**/api/series?**", async (route) => {
    const url = new URL(route.request().url());
    if (Number(url.searchParams.get("to")) - Number(url.searchParams.get("from")) === 30 * 86400) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Obsolete test request" }) });
      releaseFailure();
    } else await route.continue();
  });
  await page.locator('[data-range="30"]').click();
  const all = await seriesAfter(page, () => page.locator('[data-range="all"]').click());
  await expectRanking(page, all.rows);
  await failureReleased;
  await expect(page.locator("#range-summary")).not.toContainText(/查询失败|Query failed/);
  await expect(page.locator("#ranking-note")).not.toContainText(/查询失败|Query failed/);
  await expect(page.locator(".ranking-panel")).toHaveAttribute("aria-busy", "false");
  await expectRanking(page, all.rows);
});

test("source filters can return to all time without an invalid range", async ({ page }) => {
  const badResponses = [];
  page.on("response", (response) => {
    if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`);
  });
  await waitForDashboard(page);
  await page.locator("#source-select").selectOption("proxy");
  await page.locator('[data-range="all"]').click();
  await expect(page.locator("#range-summary")).not.toContainText(/查询失败|Query failed/);
  await expect(page.locator("#date-from")).not.toHaveValue("");
  await expect(page.locator("#date-to")).not.toHaveValue("");
  expect(badResponses).toEqual([]);
});

test("short heatmap ranges identify unobserved cells and token share renders as PNG", async ({ page }) => {
  await waitForDashboard(page);
  await page.locator('[data-range="1"]').click();
  await expect(page.locator("#heatmap-note")).toContainText(/1/);
  await expect(page.locator("#rhythm-facts")).toContainText(/观察窗口内的空档|Gaps in the observed window/);
  await expect(page.locator(".heatmap-cell.unobserved")).toHaveCount(144);

  await page.locator("#share-button").click();
  await page.locator('[data-share-template="tokens"]').click();
  await expect(page.locator("#share-template")).toHaveValue("tokens");
  await expect(page.locator('[data-share-template="tokens"]')).toHaveClass(/active/);
  await expect.poll(() => page.locator("#share-preview").evaluate((image) => [image.naturalWidth, image.naturalHeight])).toEqual([2400, 1350]);
});

test("language and theme changes preserve the active range", async ({ page }) => {
  await waitForDashboard(page);
  const beforeFrom = await page.locator("#date-from").inputValue();
  const beforeTo = await page.locator("#date-to").inputValue();
  const themeBefore = await page.locator("html").getAttribute("data-theme");
  await page.locator("#lang-toggle").click();
  await expect(page.locator("#date-from")).toHaveValue(beforeFrom);
  await expect(page.locator("#date-to")).toHaveValue(beforeTo);
  await page.locator("#theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", themeBefore === "light" ? "dark" : "light");
});


test("range changes reset the default Top 5 model selection", async ({ page }) => {
  await waitForDashboard(page);
  await expect(page.locator("#model-view-select")).toHaveValue("top");
  await expect(page.locator(".legend-chip[aria-pressed=\"true\"]")).toHaveCount(5);
  await page.locator('[data-range="year"]').click();
  await expect(page.locator("#range-summary")).not.toContainText(/查询失败|Query failed/);
  await expect(page.locator(".legend-chip[aria-pressed=\"true\"]")).toHaveCount(5);
  await page.locator('[data-range="all"]').click();
  await expect(page.locator("#range-summary")).not.toContainText(/查询失败|Query failed/);
  await expect(page.locator(".legend-chip[aria-pressed=\"true\"]")).toHaveCount(5);
});

test("custom date controls are editable and apply a local range", async ({ page }) => {
  await waitForDashboard(page);
  const fromMonth = (await page.locator("#date-from").inputValue()).slice(0, 7);
  const toMonth = (await page.locator("#date-to").inputValue()).slice(0, 7);
  await page.locator("#date-from-trigger").click();
  await page.locator(".date-picker-day:not(.outside)").filter({ hasText: /^1$/ }).click();
  await page.locator("#date-from-time").fill("08:15");
  await page.locator("#date-to-trigger").click();
  await page.locator(".date-picker-day:not(.outside)").filter({ hasText: /^3$/ }).click();
  await page.locator("#date-to-time").fill("19:45");
  const series = await seriesAfter(page, () => page.locator("#apply-button").click());
  await expectRanking(page, series.rows);
  await expect(page.locator("#date-from")).toHaveValue(`${fromMonth}-01T08:15`);
  await expect(page.locator("#date-to")).toHaveValue(`${toMonth}-03T19:45`);
  await expect(page.locator("#range-summary")).toContainText(`${fromMonth.slice(5)}/01`);
  await expect(page.locator("#range-summary")).toContainText(`${toMonth.slice(5)}/03`);
});

for (const width of [1920, 1600, 1440, 1320, 1280, 1240, 1180, 1094, 1024, 900]) {
  test(`date fields remain compact and aligned at ${width}px in both languages and themes`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await waitForDashboard(page);
    for (const lang of ["zh", "en"]) {
      if ((await page.locator("html").getAttribute("lang")).startsWith("zh") !== (lang === "zh")) await page.locator("#lang-toggle").click();
      for (const theme of ["dark", "light"]) {
        if (await page.locator("html").getAttribute("data-theme") !== theme) await page.locator("#theme-toggle").click();
        const layout = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          controlsRight: document.querySelector(".chart-controls").getBoundingClientRect().right,
          chartRight: document.querySelector(".chart-panel").getBoundingClientRect().right,
          ranking: document.querySelector(".ranking-panel").getBoundingClientRect().toJSON(),
          rankingScope: document.querySelector(".ranking-scope").getBoundingClientRect().toJSON(),
          rankingButtons: [...document.querySelectorAll("[data-ranking-scope]")].map((button) => ({
            width: button.getBoundingClientRect().width,
            scrollWidth: button.scrollWidth,
            clientWidth: button.clientWidth,
          })),
          titleWidth: document.querySelector(".chart-header > div:first-child").getBoundingClientRect().width,
          fields: [...document.querySelectorAll(".date-input-group")].map((el) => {
            const trigger = el.querySelector(".date-trigger");
            const text = document.createRange();
            text.selectNodeContents(trigger);
            return {
              width: el.getBoundingClientRect().width,
              top: el.getBoundingClientRect().top,
              blank: el.querySelector(".time-input").getBoundingClientRect().left - text.getBoundingClientRect().right,
            };
          }),
          apply: document.querySelector("#apply-button").getBoundingClientRect().toJSON(),
          end: document.querySelector("#date-to-time").closest(".date-input-group").getBoundingClientRect().toJSON(),
          panelRight: document.querySelector(".filter-panel").getBoundingClientRect().right,
        }));
        expect(layout.overflow).toBe(false);
        expect(layout.controlsRight).toBeLessThanOrEqual(layout.chartRight + 1);
        expect(layout.rankingScope.left).toBeGreaterThanOrEqual(layout.ranking.left + 20);
        expect(layout.rankingScope.right).toBeLessThanOrEqual(layout.ranking.right - 20);
        for (const button of layout.rankingButtons) {
          expect(button.width).toBeGreaterThanOrEqual(90);
          expect(button.scrollWidth).toBeLessThanOrEqual(button.clientWidth);
        }
        expect(layout.titleWidth).toBeGreaterThanOrEqual(180);
        for (const field of layout.fields) {
          expect(field.width).toBeLessThanOrEqual(160);
          expect(field.blank).toBeLessThanOrEqual(34);
        }
        expect(Math.abs(layout.fields[0].width - layout.fields[1].width)).toBeLessThan(1);
        expect(Math.abs(layout.fields[0].top - layout.fields[1].top)).toBeLessThan(1);
        expect(Math.abs(layout.apply.top - layout.end.top)).toBeLessThan(4);
        expect(layout.apply.left - layout.end.right).toBeLessThanOrEqual(12);
        expect(layout.apply.right).toBeLessThanOrEqual(layout.panelRight - 8);

        for (const prefix of ["from", "to"]) {
          const trigger = page.locator(`#date-${prefix}-trigger`);
          await trigger.click();
          await expect(trigger).toHaveAttribute("aria-expanded", "true");
          await expect(page.locator("#date-picker-popover")).toBeVisible();
          const anchor = await trigger.locator("..").boundingBox();
          const popover = await page.locator("#date-picker-popover").boundingBox();
          expect(Math.abs(popover.y - anchor.y - anchor.height - 8)).toBeLessThan(1);
          expect(popover.x + popover.width).toBeLessThanOrEqual(layout.panelRight - 8);
          await page.keyboard.press("Escape");
          await expect(page.locator("#date-picker-popover")).toBeHidden();
          await expect(trigger).toBeFocused();
          await expect(trigger).toHaveAttribute("aria-expanded", "false");
        }
      }
    }
  });
}

test("clearing a date keeps its field width and an open calendar follows a desktop resize", async ({ page }) => {
  await waitForDashboard(page);
  const trigger = page.locator("#date-from-trigger");
  const before = await trigger.locator("..").boundingBox();
  await trigger.click();
  await page.locator(".date-picker-footer-button").first().click();
  await expect(page.locator("#date-from")).toHaveValue("");
  await expect(trigger).toHaveText("—");
  const cleared = await trigger.locator("..").boundingBox();
  expect(cleared.width).toBe(before.width);

  await page.locator("#date-to-trigger").click();
  await page.setViewportSize({ width: 900, height: 1000 });
  const anchor = await page.locator("#date-to-trigger").locator("..").boundingBox();
  await expect.poll(async () => {
    const popover = await page.locator("#date-picker-popover").boundingBox();
    return Math.abs(popover.y - anchor.y - anchor.height - 8);
  }).toBeLessThan(1);
  await page.locator(".welcome-row h1").click();
  await expect(page.locator("#date-picker-popover")).toBeHidden();
});

test("1280px range controls adapt to wider platform fallback fonts", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await waitForDashboard(page);
  if ((await page.locator("html").getAttribute("lang")).startsWith("zh")) await page.locator("#lang-toggle").click();
  // Model the extra text width from CI fallback fonts, without weakening the
  // existing panel padding or overflow assertions.
  await page.addStyleTag({ content: ".presets { letter-spacing: .75px; }" });
  for (const font of ["Arial, sans-serif", "monospace"]) {
    await page.evaluate((font) => document.documentElement.style.fontFamily = font, font);
    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      panelRight: document.querySelector(".filter-panel").getBoundingClientRect().right,
      applyRight: document.querySelector("#apply-button").getBoundingClientRect().right,
      fromTop: document.querySelector("#date-from-trigger").getBoundingClientRect().top,
      toTop: document.querySelector("#date-to-trigger").getBoundingClientRect().top,
    }));
    expect(layout.overflow, font).toBe(false);
    expect(layout.applyRight, font).toBeLessThanOrEqual(layout.panelRight - 8);
    expect(layout.fromTop, font).toBe(layout.toTop);
  }
});

test("share exports include model counts and keep the repository icon clear of its name", async ({ page }) => {
  await waitForDashboard(page);
  await page.evaluate(() => {
    window.shareMarks = { texts: [], icons: [], lines: [] };
    const prototype = CanvasRenderingContext2D.prototype;
    const fillText = prototype.fillText, fill = prototype.fill, stroke = prototype.stroke;
    prototype.stroke = function(...args) {
      if (this.canvas.width === 2400 && this.canvas.height === 1350 && this.lineWidth >= 2) window.shareMarks.lines.push(this.strokeStyle);
      return stroke.apply(this, args);
    };
    prototype.fillText = function(text, x, y, ...rest) {
      if (this.canvas.width === 2400 && this.canvas.height === 1350) {
        const transform = this.getTransform();
        const measurement = this.measureText(text);
        const left = (x - (this.textAlign === "right" ? measurement.width : this.textAlign === "center" ? measurement.width / 2 : 0)) * transform.a + transform.e;
        window.shareMarks.texts.push({ text: String(text), left, right: left + measurement.width * transform.a,
          top: (y - measurement.actualBoundingBoxAscent) * transform.d + transform.f,
          bottom: (y + measurement.actualBoundingBoxDescent) * transform.d + transform.f,
          baseline: y * transform.d + transform.f });
      }
      return fillText.call(this, text, x, y, ...rest);
    };
    prototype.fill = function(...args) {
      if (this.canvas.width === 2400 && this.canvas.height === 1350 && args[0] instanceof Path2D) {
        const transform = this.getTransform();
        window.shareMarks.icons.push({ right: transform.e + 16 * transform.a });
      }
      return fill.apply(this, args);
    };
  });
  for (const lang of ["zh", "en"]) {
    if ((await page.locator("html").getAttribute("lang")).startsWith("zh") !== (lang === "zh")) await page.locator("#lang-toggle").click();
    for (const theme of ["dark", "light"]) {
      if (await page.locator("html").getAttribute("data-theme") !== theme) await page.locator("#theme-toggle").click();
      const count = await page.locator("#kpi-models").textContent();
      await page.locator("#share-button").click();
      await expect(page.locator("[data-share-template]")).toHaveCount(2);
      for (const template of ["calls", "tokens"]) {
        await page.evaluate(() => window.shareMarks = { texts: [], icons: [], lines: [] });
        await page.locator(`[data-share-template="${template}"]`).click();
        const marks = await page.evaluate(() => window.shareMarks);
        const name = marks.texts.find((mark) => mark.text === "ccswitch-pulse");
        const colors = await page.evaluate((metric) => shareSegments(metric).map((entry) => entry.color), template);
        expect(new Set(colors).size).toBe(colors.length);
        expect(marks.lines.sort()).toEqual(colors.sort());
        expect(name.left - marks.icons[0].right).toBeGreaterThanOrEqual(19);
        for (const mark of marks.texts) {
          expect(mark.left, mark.text).toBeGreaterThanOrEqual(64);
          expect(mark.right, mark.text).toBeLessThanOrEqual(2336);
          expect(mark.top, mark.text).toBeGreaterThanOrEqual(48);
          expect(mark.bottom, mark.text).toBeLessThanOrEqual(1302);
        }
        expect(marks.texts.some((mark) => mark.text.includes(`${count} ${lang === "zh" ? "个模型" : "models"}`))).toBe(true);
        {
          const ticks = marks.texts.filter((mark) => Math.abs(mark.baseline - 1068) < 1);
          expect(ticks.length).toBeGreaterThanOrEqual(2);
          for (let i = 1; i < ticks.length; i++) expect(ticks[i].left - ticks[i - 1].right).toBeGreaterThanOrEqual(12);
        }
        await expect.poll(() => page.locator("#share-preview").evaluate((image) => [image.naturalWidth, image.naturalHeight])).toEqual([2400, 1350]);
      }
      await page.locator("#share-close").click();
    }
  }
});

test("share time axes cover the selected range and token bins retain the full daily total even for weekly charts", async ({ page }) => {
  await waitForDashboard(page);
  for (const range of ["1", "7", "all"]) {
    await seriesAfter(page, () => page.locator(`[data-range="${range}"]`).click());
    await expect(page.locator(".ranking-panel")).toHaveAttribute("aria-busy", "false");
    for (const metric of ["calls", "tokens"]) {
      const plan = await page.evaluate((metric) => {
        const timeline = shareTimeline(metric);
        return { bins: timeline.bins.map((bin) => ({ ...bin, models: [...bin.models] })), caption: timeline.caption, hourly: timeline.hourly,
          expected: state.report.current[metric], range: state.range,
          modelTotals: state.report.current.models.map((model) => ({ model: model.model, value: model[metric] })),
          labels: timeline.bins.map((bin) => timeline.tickLabel(bin.from)) };
      }, metric);
      expect(plan.bins[0].from).toBe(plan.range.from);
      expect(plan.bins.at(-1).to).toBe(plan.range.to);
      expect(plan.bins.reduce((sum, bin) => sum + bin.value, 0)).toBe(plan.expected);
      for (const bin of plan.bins) expect(bin.models.reduce((sum, [, value]) => sum + value, 0)).toBe(bin.value);
      const modelTotals = new Map();
      for (const bin of plan.bins) for (const [model, value] of bin.models) modelTotals.set(model, (modelTotals.get(model) || 0) + value);
      for (const model of plan.modelTotals) expect(modelTotals.get(model.model) || 0).toBe(model.value);
      for (let i = 1; i < plan.bins.length; i++) expect(plan.bins[i].from).toBe(plan.bins[i - 1].to);
      expect(plan.hourly).toBe(range === "1");
      if (range === "1") expect(plan.labels.every((label) => /\d{2}:\d{2}/.test(label))).toBe(true);
      if (range === "all") {
        expect(plan.labels[0]).toMatch(/2025/);
        expect(plan.labels.at(-1)).toMatch(/2026/);
      }
    }
  }
  await seriesAfter(page, () => page.locator("#bucket-select").selectOption("1w"));
  const weekly = await page.evaluate(() => ({
    bucket: state.series.range.bucket,
    plotted: shareTimeline("tokens").bins.reduce((sum, bin) => sum + bin.value, 0),
    expected: state.report.current.tokens,
    first: shareTimeline("tokens").bins[0].from,
    from: state.range.from,
  }));
  expect(weekly.bucket).toBe(604800);
  expect(weekly.plotted).toBe(weekly.expected);
  expect(weekly.first).toBe(weekly.from);
});

test("the token report handles a valid zero-token range without inventing percentages or leaking other metrics", async ({ page }) => {
  await page.route(/\/api\/(series|report)\?/, async (route) => {
    const response = await route.fetch(), body = await response.json();
    if (body.rows) {
      body.totals.tokens = 0;
      for (const row of body.rows) row.tokens = 0;
    } else {
      for (const period of [body.current, body.previous].filter(Boolean)) {
        period.tokens = 0;
        for (const rows of [period.days, period.models, period.modelDays]) for (const row of rows) row.tokens = 0;
      }
    }
    await route.fulfill({ response, json: body });
  });
  await waitForDashboard(page);
  await page.evaluate(() => {
    window.zeroTokenTexts = [];
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function(text, ...args) {
      if (this.canvas.width === 2400 && this.canvas.height === 1350) window.zeroTokenTexts.push(String(text));
      return fillText.call(this, text, ...args);
    };
  });
  await page.locator("#share-button").click();
  await page.locator('[data-share-template="tokens"]').click();
  expect(await page.evaluate(() => shareSegments("tokens").reduce((sum, entry) => sum + entry.percent, 0))).toBe(0);
  expect((await page.evaluate(() => window.zeroTokenTexts)).some((text) => /未记录 Token|No token usage/.test(text))).toBe(true);
  await expect.poll(() => page.locator("#share-preview").evaluate((image) => [image.naturalWidth, image.naturalHeight])).toEqual([2400, 1350]);
});

test("redesigned share cards preserve privacy and their model percentages sum to 100", async ({ page }) => {
  await waitForDashboard(page);
  for (const metric of ["calls", "tokens"]) {
    const shares = await page.evaluate((metric) => shareSegments(metric).map((entry) => entry.percent), metric);
    expect(shares.reduce((sum, share) => sum + share, 0)).toBe(100);
  }
  await page.evaluate(() => {
    window.privateShareTexts = [];
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function(text, ...args) {
      if (this.canvas.width === 2400 && this.canvas.height === 1350) window.privateShareTexts.push(String(text));
      return fillText.call(this, text, ...args);
    };
  });
  const tokenValue = await page.evaluate(() => compact(state.report.current.tokens));
  await page.locator("#share-button").click();
  await page.locator('[data-share-template="tokens"]').click();
  await page.locator("#share-show-latest").uncheck();
  await page.evaluate(() => window.privateShareTexts = []);
  await page.locator("#share-show-tokens").uncheck();
  await expect(page.locator('[data-share-template="tokens"]')).toBeDisabled();
  await expect(page.locator('[data-share-template="calls"]')).toHaveAttribute("aria-pressed", "true");
  const texts = await page.evaluate(() => window.privateShareTexts);
  expect(texts).not.toContain(tokenValue);
  expect(texts.some((text) => /最晚活跃|Last active/.test(text))).toBe(false);
  expect(texts.some((text) => /Token 已隐藏|Tokens hidden/.test(text))).toBe(true);
  expect(texts.some((text) => /调用趋势|Calls over time/.test(text))).toBe(true);
  await page.locator("#share-show-cost").check();
  expect((await page.evaluate(() => window.privateShareTexts)).some((text) => /估算费用|Estimated cost/.test(text))).toBe(true);
});
