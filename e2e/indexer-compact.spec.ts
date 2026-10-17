import { test, expect } from "@playwright/test";

test("Indexer 得分与行号按内容收紧，保持连接和选中行", async ({ page }) => {
  await page.setViewportSize({ width: 2400, height: 2200 });
  await page.goto("/#model=v41&chapter=layer");
  const focus = page.getByRole("combobox", { name: "定位模块" });
  for (const layer of [3, 15, 29]) {
    await page
      .getByRole("button", { name: String(layer), exact: true })
      .click();
    if (layer === 29)
      await page
        .getByRole("button", { name: "Decode · 单步一行", exact: true })
        .click();
    await focus.selectOption("indexer");
    const root = page.locator('.react-flow__node[data-id="indexer"]');
    const result = root.locator("[data-index-result-flow]");
    await expect(result).toBeVisible();
    const measurements = await result.evaluate((el) => {
      const matrix = el.querySelector<HTMLElement>("[data-expanded-tensor]")!;
      const selection = el.querySelector<HTMLElement>(
        "[data-index-selection]",
      )!;
      const summaryBounds = el
        .querySelector("[data-index-score-summary]")!
        .getBoundingClientRect();
      const stagesBounds = el
        .querySelector("[data-index-selection-stages]")!
        .getBoundingClientRect();
      return {
        cells: [...el.querySelectorAll<HTMLElement>("[data-vector-cell]")].map(
          (n) => n.offsetWidth,
        ),
        matrixWidth: matrix.offsetWidth,
        selectionWidth: selection.offsetWidth,
        matrixBeforeSelection:
          matrix.getBoundingClientRect().right <
          selection.getBoundingClientRect().left,
        sameRow:
          Math.min(summaryBounds.bottom, stagesBounds.bottom) >
          Math.max(summaryBounds.top, stagesBounds.top),
        selected: matrix.querySelectorAll('[data-vector-selected="true"]')
          .length,
        overflow: [...el.querySelectorAll<HTMLElement>("div,span")]
          .filter((n) => n.clientWidth > 0 && n.scrollWidth > n.clientWidth + 2)
          .map((n) => n.textContent?.slice(0, 80)),
      };
    });
    expect(measurements.cells.length).toBeGreaterThan(8);
    expect(Math.max(...measurements.cells)).toBeLessThan(120);
    expect(measurements.matrixWidth).toBeLessThan(400);
    expect(measurements.selectionWidth).toBeLessThan(800);
    expect(measurements.matrixBeforeSelection).toBe(true);
    expect(measurements.sameRow).toBe(true);
    expect(measurements.selected).toBe(1);
    expect(measurements.overflow).toEqual([]);
    console.log(`Indexer ${layer}`, measurements);
    await result.screenshot({ path: `artifacts/indexer-compact-${layer}.png` });
    if (layer === 15)
      await root.screenshot({ path: "artifacts/indexer-compact-full.png" });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await focus.selectOption("indexer");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await expect(page.locator(".katex-error")).toHaveCount(0);
});
