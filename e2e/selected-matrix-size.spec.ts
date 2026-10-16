import { test, expect } from "@playwright/test";

test("全局 KV 矩阵普通与高亮行共享元素尺寸", async ({ page }) => {
  await page.setViewportSize({ width: 2000, height: 1400 });
  await page.goto("/#model=v41&chapter=layer");
  await page.getByRole("button", { name: "收起左栏", exact: true }).click();
  for (const layer of [3, 15, 29]) {
    await page
      .getByRole("button", { name: String(layer), exact: true })
      .click();
    await page
      .getByRole("combobox", { name: "定位模块" })
      .selectOption("concat");
    await page
      .getByRole("combobox", { name: "定位模块" })
      .selectOption("global-select");
    const matrix = page.locator("[data-selected-global-rows]");
    await expect(matrix).toBeVisible();
    const geometry = await matrix.evaluate((root) => {
      const rows = [
        ...root.querySelectorAll<HTMLElement>("[data-vector-elements]"),
      ];
      const cells = rows.flatMap((row) => [
        ...row.querySelectorAll<HTMLElement>("[data-vector-cell]"),
      ]);
      const bounds = cells.map((cell) => cell.getBoundingClientRect());
      return {
        count: cells.length,
        widths: bounds.map((b) => b.width),
        heights: bounds.map((b) => b.height),
        fonts: cells.map((cell) => getComputedStyle(cell).fontSize),
        columns: [0, 1, 2].map((i) =>
          bounds.filter((_, index) => index % 3 === i).map((b) => b.x),
        ),
        overflow: cells.some(
          (cell) =>
            cell.scrollWidth > cell.clientWidth + 1 ||
            cell.scrollHeight > cell.clientHeight + 1,
        ),
        matrixOverflow: root.scrollWidth > root.clientWidth + 1,
      };
    });
    expect(geometry.count).toBe(15);
    for (const sizes of [
      geometry.widths,
      geometry.heights,
      ...geometry.columns,
    ])
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThan(1);
    expect(new Set(geometry.fonts).size).toBe(1);
    expect(geometry.overflow).toBe(false);
    expect(geometry.matrixOverflow).toBe(false);
    const exampleSizes = await page
      .locator("[data-selection-example] [data-vector-cell]")
      .evaluateAll((cells) =>
        cells.map((cell) => {
          const box = cell.getBoundingClientRect();
          return { width: box.width, height: box.height };
        }),
      );
    for (const axis of ["width", "height"] as const)
      expect(
        Math.max(...exampleSizes.map((size) => size[axis])) -
          Math.min(...exampleSizes.map((size) => size[axis])),
      ).toBeLessThan(1);
    const bounds = (await matrix.boundingBox())!;
    await page.mouse.move(1000, 700);
    await page.mouse.down({ button: "middle" });
    await page.mouse.move(
      2000 - bounds.x - bounds.width / 2,
      1400 - bounds.y - bounds.height / 2,
      { steps: 5 },
    );
    await page.mouse.up({ button: "middle" });
    await expect(matrix).toBeInViewport({ ratio: 1 });
    await page.screenshot({
      path: `artifacts/selected-matrix-layer-${layer}.png`,
      clip: (await matrix.boundingBox())!,
    });
    const module = page.locator('.react-flow__node[data-id="global-select"]');
    await expect(module).toBeInViewport({ ratio: 1 });
    await page.screenshot({
      path: `artifacts/selected-matrix-module-${layer}.png`,
      clip: (await module.boundingBox())!,
    });
  }
});
