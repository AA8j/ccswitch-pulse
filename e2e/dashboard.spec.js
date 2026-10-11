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
