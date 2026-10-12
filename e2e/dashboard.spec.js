import { expect, test } from "@playwright/test";

async function waitForDashboard(page) {
  await page.goto("/");
  await expect(page.locator("#db-status")).toContainText(/演示数据已连接|Demo data connected/);
  await expect(page.locator("#kpi-calls")).not.toHaveText("—");
}

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
  await page.locator("#apply-button").click();
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
    window.shareMarks = { texts: [], icons: [] };
    const prototype = CanvasRenderingContext2D.prototype;
    const fillText = prototype.fillText, fill = prototype.fill;
    prototype.fillText = function(text, x, y, ...rest) {
      if (this.canvas.width === 2400 && this.canvas.height === 1350) {
        const transform = this.getTransform();
        window.shareMarks.texts.push({ text: String(text), left: (x - (this.textAlign === "right" ? this.measureText(text).width : 0)) * transform.a + transform.e });
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
      for (const template of ["story", "mix", "rhythm", "tokens"]) {
        await page.evaluate(() => window.shareMarks = { texts: [], icons: [] });
        await page.locator(`[data-share-template="${template}"]`).click();
        const marks = await page.evaluate(() => window.shareMarks);
        const name = marks.texts.find((mark) => mark.text === "ccswitch-pulse");
        expect(name.left - marks.icons[0].right).toBeGreaterThanOrEqual(19);
        if (template === "mix") expect(marks.texts.some((mark) => mark.text === `${count} ${lang === "zh" ? "个模型" : "models"}`)).toBe(true);
        await expect.poll(() => page.locator("#share-preview").evaluate((image) => [image.naturalWidth, image.naturalHeight])).toEqual([2400, 1350]);
      }
      await page.locator("#share-close").click();
    }
  }
});
