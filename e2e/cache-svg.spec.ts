import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

test("缓存示例连续两步：结构、旁注、宽窄屏、完整 SVG 与离线打开", async ({
  page,
  context,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 2000, height: 3400 });
  await page.goto("/#model=v41&chapter=cache");
  await page.getByRole("button", { name: "收起左栏", exact: true }).click();
  for (const [index, id] of [
    "history128",
    "local129",
    "global129",
    "attend129",
    "reuse129",
    "local130",
    "global130",
    "attend130",
    "reuse130",
  ].entries()) {
    await page
      .getByRole("navigation", { name: "图中步骤" })
      .getByRole("button")
      .nth(index)
      .click();
    const stage = page.locator(`[data-stage="${id}"]`);
    await expect(stage).toBeVisible();
    await expect(stage.locator(".cache-note")).toBeVisible();
    await expect(stage.locator(".katex-error")).toHaveCount(0);
    if (id === "local129") await expect(stage).toContainText("淘汰 token 1");
    if (id === "local130") await expect(stage).toContainText("淘汰 token 2");
    if (id === "global129")
      await expect(stage.locator("[data-new-row]")).toHaveCount(0);
    if (id === "global130")
      await expect(stage.locator("[data-new-row]")).toHaveCount(2);
    if (id.startsWith("global")) {
      const result = await stage
        .locator(".cache-index-selection > .data-box")
        .boundingBox();
      const group = await stage.locator(".cache-index-selection").boundingBox();
      expect(
        Math.abs(result!.x + result!.width / 2 - group!.x - group!.width / 2),
      ).toBeLessThan(2);
    }
    if (id === "global130") {
      const normalize = stage.locator(".cache-normalize");
      expect(
        await normalize.evaluate((el) => el.scrollWidth - el.clientWidth),
      ).toBeLessThanOrEqual(1);
      await normalize
        .locator("..")
        .screenshot({ path: "artifacts/cache-sum-detail.png" });
    }
    if (id === "reuse130") await expect(stage).toContainText("193");
    const overflow = await stage.evaluate((root) =>
      [
        ...root.querySelectorAll<HTMLElement>(
          ".cache-matrix,.cache-weight,.cache-query,.cache-structure,.cache-example",
        ),
      ]
        .filter((el) => el.scrollWidth > el.clientWidth + 2)
        .map((el) => el.className),
    );
    expect(overflow).toEqual([]);
    const height = await stage.evaluate(
      (el) => el.getBoundingClientRect().height,
    );
    await page.setViewportSize({
      width: 2000,
      height: Math.ceil(height + 800),
    });
    await page
      .getByRole("navigation", { name: "图中步骤" })
      .getByRole("button")
      .nth(index)
      .click();
    await stage.screenshot({ path: `artifacts/cache-${id}.png` });
  }
  await page.setViewportSize({ width: 800, height: 1100 });
  await page
    .getByRole("navigation", { name: "图中步骤" })
    .getByRole("button")
    .first()
    .click();
  await expect(page.locator(".katex-error")).toHaveCount(0);
  await page.screenshot({ path: "artifacts/cache-narrow.png" });
  const camera = await page
    .locator(".react-flow__viewport")
    .getAttribute("style");
  const historyNode = page.locator('.react-flow__node[data-id="history128"]');
  const originalTransform = await historyNode.evaluate(
    (el) => getComputedStyle(el).transform,
  );
  const title = (await page
    .locator('[data-stage="history128"] .stage-title')
    .boundingBox())!;
  await page.mouse.move(title.x + 150, title.y + 20);
  await page.mouse.down();
  await page.mouse.move(title.x + 190, title.y + 50, { steps: 6 });
  await page.mouse.up();
  await expect
    .poll(() => historyNode.evaluate((el) => getComputedStyle(el).transform))
    .not.toBe(originalTransform);
  const movedTransform = await historyNode.evaluate(
    (el) => getComputedStyle(el).transform,
  );
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 SVG", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(
    "V41-token-129-130-layer-3-4-decode.svg",
  );
  const file = path.resolve("artifacts/cache-129-130.svg");
  await download.saveAs(file);
  const xml = await readFile(file, "utf8");
  expect(xml).toContain("data:font/");
  expect(xml).not.toContain("data:image/png");
  expect(xml).toContain('data-stage="reuse129"');
  await expect(
    page.getByRole("button", { name: "导出 SVG", exact: true }),
  ).toBeEnabled();
  expect(
    await page.locator(".react-flow__viewport").getAttribute("style"),
  ).toBe(camera);
  const offline = await context.newPage();
  await offline.setViewportSize({ width: 2200, height: 3400 });
  await offline.goto(pathToFileURL(file).href);
  expect(await offline.locator("parsererror").count()).toBe(0);
  await expect(offline.locator(".stage-card")).toHaveCount(9);
  expect(
    await offline
      .locator('.react-flow__node[data-id="history128"]')
      .evaluate((el) => getComputedStyle(el).transform),
  ).toBe(movedTransform);
  const weight = offline.locator('[data-stage="reuse129"] .cache-weight');
  const tops = await weight
    .locator(".cache-inline > *")
    .evaluateAll((elements) =>
      elements.map((el) => el.getBoundingClientRect().top),
    );
  expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(10);
  for (const id of ["history128", "global129", "global130", "reuse130"]) {
    await offline
      .locator(`[data-stage="${id}"]`)
      .screenshot({ path: `artifacts/cache-svg-${id}.png` });
  }
  await offline
    .locator('[data-stage="history128"]')
    .screenshot({ path: "artifacts/cache-svg-offline.png" });
  await offline.close();
  expect(errors).toEqual([]);
});

test("字体下载失败时停止导出并恢复界面，重试可成功", async ({ page }) => {
  await page.goto("/#model=v41&chapter=cache");
  await expect(
    page.getByRole("button", { name: "导出 SVG", exact: true }),
  ).toBeEnabled();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.route(/\.woff2?$/, (route) =>
    route.fulfill({ status: 503, body: "unavailable" }),
  );
  await page.getByRole("button", { name: "导出 SVG", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("字体载入失败");
  await expect(
    page.getByRole("button", { name: "导出 SVG", exact: true }),
  ).toBeEnabled();
  await page.unroute(/\.woff2?$/);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 SVG", exact: true }).click();
  await download;
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("完整层 SVG 包含屏幕外模块内部，不改变布局与相机", async ({
  page,
  context,
}) => {
  test.setTimeout(180000);
  await page.goto("/#model=v41&chapter=layer");
  await page.getByRole("button", { name: "3", exact: true }).click();
  await page
    .getByRole("button", { name: "Decode · 单步一行", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "定位模块" })
    .selectOption("compressor");
  await expect(
    page.locator(
      '.architecture-flow[data-render-layer="3"][data-render-phase="decode"]',
    ),
  ).toBeVisible();
  const camera = await page
    .locator(".react-flow__viewport")
    .getAttribute("style");
  const saved = await page.evaluate(() => JSON.stringify(localStorage));
  const downloadPromise = page.waitForEvent("download", { timeout: 120000 });
  await page.getByRole("button", { name: "导出 SVG", exact: true }).click();
  const download = await downloadPromise;
  const file = path.resolve("artifacts/layer3-decode.svg");
  await download.saveAs(file);
  const xml = await readFile(file, "utf8");
  expect(xml).toContain("Router");
  expect(xml).toContain("Attention");
  expect(xml).toContain("Compressor");
  await expect(
    page.getByRole("button", { name: "导出 SVG", exact: true }),
  ).toBeEnabled();
  expect(
    await page.locator(".react-flow__viewport").getAttribute("style"),
  ).toBe(camera);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).toBe(saved);
  const offline = await context.newPage();
  await offline.goto(pathToFileURL(file).href);
  expect(await offline.locator("parsererror").count()).toBe(0);
  await expect(
    offline.locator('[data-id="compressor"] [data-rmsnorm]'),
  ).toHaveCount(1);
  await offline
    .locator('[data-id="compressor"]')
    .screenshot({ path: "artifacts/layer3-svg-compressor.png" });
  await offline.close();
});
