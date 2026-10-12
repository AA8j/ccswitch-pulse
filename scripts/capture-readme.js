// Run npm run images:prepare, then Playwright CLI:
// run-code --filename=output/playwright/readme/capture-prepared.js
// Start a demo-only server on port 3468 first. All candidates stay in ignored
// output/playwright/readme until visual review and publication.
async function captureReadme(page) {
  const sourceFingerprint = "__CAPTURE_SOURCE_FINGERPRINT__";
  if (sourceFingerprint.startsWith("__")) throw new Error("Run npm run images:prepare first.");
  const browser = page.context().browser();
  let appVersion = null;
  for (const lang of ["zh", "en"]) {
    for (const theme of ["dark", "light"]) {
      const context = await browser.newContext({
        viewport: { width: 1600, height: 1500 },
        deviceScaleFactor: 2,
        colorScheme: theme,
        timezoneId: "Asia/Shanghai",
        reducedMotion: "reduce",
      });
      try {
        await context.addInitScript(({ lang, theme }) => {
          localStorage.setItem("ccswitch-pulse-language", lang);
          localStorage.setItem("ccswitch-pulse-theme", theme);
        }, { lang, theme });
        const preview = await context.newPage();
        const errors = [];
        preview.on("pageerror", (error) => errors.push(error.message));
        preview.on("response", (response) => {
          if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
        });
        await preview.goto("http://127.0.0.1:3468");
        const demo = await preview.evaluate(() => fetch("/api/meta").then((response) => response.json()).then((meta) => meta.demo));
        if (demo !== true) throw new Error("Documentation capture requires demo data; refusing to capture a personal database.");
        const version = (await preview.locator(".side-version span").last().textContent()).trim().replace(/^v/, "");
        if (appVersion && appVersion !== version) throw new Error("App version changed during capture.");
        appVersion = version;
        await preview.locator("#kpi-calls").filter({ hasText: /^[\d,]+$/ }).waitFor();
        await preview.locator("#report-leader").filter({ hasText: /deepseek/ }).waitFor();
        await preview.evaluate(() => document.fonts.ready);
        // Finish the chart's initial animation before capturing canvas pixels.
        await preview.waitForTimeout(450);
        const timeline = await preview.locator("#timeline").boundingBox();
        await preview.setViewportSize({ width: 1600, height: Math.ceil(timeline.y + timeline.height + 18) });
        const stem = `${theme}-${lang}`;
        const path = (kind) => `output/playwright/readme/${kind}-${stem}.png`;
        await preview.screenshot({ path: path("dashboard"), animations: "disabled" });
        await preview.locator("#report").screenshot({ path: path("report"), animations: "disabled" });

        await preview.locator("#report-share").click();
        await preview.locator("#share-preview").waitFor();
        await preview.waitForFunction(() => {
          const image = document.querySelector("#share-preview");
          return image.complete && image.naturalWidth === 2400 && image.naturalHeight === 1350;
        });
        const [download] = await Promise.all([
          preview.waitForEvent("download"),
          preview.locator("#share-download").click(),
        ]);
        await download.saveAs(path("share"));
        await preview.locator("#share-close").click();

        if (theme === "dark") {
          await preview.setViewportSize({ width: 1094, height: 1000 });
          // Allow the app's 180ms resize debounce to finish before measuring
          // a crop; coordinates taken during relayout can clip the first preset.
          await preview.waitForTimeout(250);
          // Report capture scrolls the page. Reset before measuring a viewport
          // crop, so scrolling/resizing cannot clip the calendar example.
          await preview.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" }));
          await preview.locator("#date-from-trigger").click();
          await preview.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          const panel = await preview.locator(".filter-panel").boundingBox();
          const popup = await preview.locator("#date-picker-popover").boundingBox();
          await preview.screenshot({
            path: path("date-range"),
            animations: "disabled",
            clip: { x: panel.x - 4, y: panel.y - 4, width: panel.width + 8, height: popup.y + popup.height - panel.y + 8 },
          });
        }
        if (errors.length) throw new Error(errors.join("\n"));
      } finally {
        await context.close();
      }
    }
  }
  const metadata = { appVersion, sourceFingerprint, capturedAt: new Date().toISOString(), demo: true };
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.evaluate((metadata) => {
      const url = URL.createObjectURL(new Blob([JSON.stringify(metadata)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "capture-meta.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, metadata),
  ]);
  await download.saveAs("output/playwright/readme/capture-meta.json");
}
