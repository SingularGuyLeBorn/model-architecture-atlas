import { test, expect } from "@playwright/test";

test("mHC 第一行拼接与归一化、第二行投影，标量不撑满宽栏", async ({ page }) => {
  await page.setViewportSize({ width: 2800, height: 2400 });
  await page.goto("/#model=v41&chapter=layer");
  const focus = page.getByRole("combobox", { name: "定位模块" });
  for (const layer of [1, 15, 29]) {
    await page
      .getByRole("button", { name: String(layer), exact: true })
      .click();
    if (layer === 29)
      await page
        .getByRole("button", { name: "Decode · 单步一行", exact: true })
        .click();
    await focus.selectOption("hc-mix-a");
    const root = page.locator('.react-flow__node[data-id="hc-mix-a"]');
    await expect(root.locator("[data-mhc-compact-column]")).toBeVisible();
    const roleColors = await root
      .locator('[data-mhc-gate="p"] [data-mhc-affine-row]')
      .first()
      .evaluate((el) =>
        [...el.children]
          .filter((child) => child.tagName === "DIV")
          .map((child) => getComputedStyle(child).backgroundColor),
      );
    expect(roleColors).toHaveLength(4);
    expect(new Set(roleColors).size).toBe(4);
    await expect(root.locator("[data-mhc-affine-legend]")).toBeVisible();
    const measurements = await root.evaluate((el) => {
      const widths = (selector: string) =>
        [...el.querySelectorAll<HTMLElement>(selector)].map(
          (item) => item.offsetWidth,
        );
      const rect = (selector: string) =>
        el.querySelector(selector)!.getBoundingClientRect();
      const norm = rect("[data-mhc-joint-norm]"),
        projection = rect("[data-mhc-projection]");
      const flatten = rect("[data-mhc-flatten]");
      const p = rect('[data-mhc-gate="p"]'),
        q = rect('[data-mhc-gate="q"]');
      return {
        width: (el as HTMLElement).offsetWidth,
        columnCells: widths(
          "[data-mhc-compact-column] [data-stacked-sum] > div:first-child > div > div",
        ),
        squareCells: widths("[data-mhc-square-element] > div"),
        divisionCells: widths("[data-mhc-normalized-vector] > div"),
        sigmoidWidth: widths("[data-mhc-sigmoid] > div")[0],
        firstRow:
          flatten.right < norm.left &&
          flatten.top < norm.bottom &&
          norm.top < flatten.bottom,
        secondRow: projection.top > Math.max(flatten.bottom, norm.bottom),
        pqSameY: Math.abs(p.y - q.y) < 1,
        overflow: [...el.querySelectorAll<HTMLElement>("div,section")]
          .filter(
            (item) =>
              item.clientWidth > 0 &&
              !item.querySelector(".react-flow__handle") &&
              item.scrollWidth > item.clientWidth + 2,
          )
          .map((item) => item.textContent?.slice(0, 70)),
      };
    });
    expect(measurements.width).toBe(2040);
    expect(measurements.columnCells).toHaveLength(4);
    expect(measurements.columnCells.every((width) => width <= 110)).toBe(true);
    for (const cells of [
      measurements.squareCells,
      measurements.divisionCells,
    ]) {
      expect(cells.length).toBeGreaterThan(0);
      expect(cells.every((width) => width <= 120)).toBe(true);
    }
    expect(measurements.sigmoidWidth).toBeLessThan(220);
    await expect(
      root.locator("[data-mhc-sigmoid] [aria-label]"),
    ).toHaveAttribute("aria-label", "\\sigma(a)=\\frac{1}{1+e^{-a}}");
    const gateFormulas = await root
      .locator("[data-mhc-gate-equations] [aria-label]")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("aria-label")),
      );
    expect(gateFormulas).toHaveLength(16);
    expect(gateFormulas.some((tex) => tex?.includes("arrow"))).toBe(false);
    expect(measurements.firstRow).toBe(true);
    expect(measurements.secondRow).toBe(true);
    expect(measurements.pqSameY).toBe(true);
    expect(measurements.overflow).toEqual([]);
    console.log(`mHC ${layer} 紧凑尺寸`, measurements);
    if (layer === 15) {
      await root.screenshot({ path: "artifacts/mhc-compact-full.png" });
      await root
        .locator("[data-mhc-gate-branches] > div")
        .first()
        .screenshot({ path: "artifacts/mhc-sigmoid-symbols.png" });
      await root
        .locator("[data-mhc-sinkhorn] > div")
        .first()
        .screenshot({ path: "artifacts/mhc-affine-colors.png" });
      await root
        .locator('[data-mhc-gate="q"]')
        .screenshot({ path: "artifacts/mhc-gate-colors.png" });
      await root
        .locator("[data-mhc-preparation]")
        .screenshot({ path: "artifacts/mhc-compact-preparation.png" });
      await root
        .locator("[data-mhc-column-normalize]")
        .screenshot({ path: "artifacts/mhc-compact-column.png" });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await focus.selectOption("hc-mix-a");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await expect(page.locator(".katex-error")).toHaveCount(0);
});
