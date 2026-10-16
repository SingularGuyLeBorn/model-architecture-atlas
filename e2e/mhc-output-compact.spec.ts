import { test, expect } from "@playwright/test";

test("mHC 两个汇合输出不随父框拉宽，矩阵同列对齐并接在 Σ 下方", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1800, height: 1400 });
  await page.goto("/#model=v41&chapter=layer");
  const focus = page.getByRole("combobox", { name: "定位模块" });
  for (const layer of [1, 15, 40]) {
    await page
      .getByRole("button", { name: String(layer), exact: true })
      .click();
    if (layer === 40)
      await page
        .getByRole("button", { name: "Decode · 单步一行", exact: true })
        .click();
    for (const branch of ["a", "f"]) {
      await focus.selectOption(`hc-pre-${branch}`);
      const module = page.locator(
        `.react-flow__node[data-id="hc-pre-${branch}"]`,
      );
      const root = module.locator("[data-mhc-pre]");
      await expect(root.locator("[data-mhc-pre-output]")).toBeVisible();
      const values = await root.evaluate((el) => {
        const matrix = el.querySelector<HTMLElement>(
          "[data-mhc-pre-output] [data-expanded-tensor]",
        )!;
        const cells = [
          ...matrix.querySelectorAll<HTMLElement>("[data-vector-cell]"),
        ];
        const widths = () => cells.map((c) => c.offsetWidth);
        const before = widths();
        const rootStyle = (el as HTMLElement).style;
        const original = rootStyle.width;
        rootStyle.width = `${(el as HTMLElement).offsetWidth + 500}px`;
        const widened = widths();
        rootStyle.width = original;
        const rows = [...matrix.querySelectorAll("[data-vector-elements]")].map(
          (row) =>
            [...row.querySelectorAll("[data-vector-cell]")].map(
              (cell) => cell.getBoundingClientRect().left,
            ),
        );
        const aligned = rows.every((row) =>
          row.every((x, i) => Math.abs(x - rows[0][i]) < 0.1),
        );
        const m = matrix.getBoundingClientRect();
        const sum = el
          .querySelector("[data-sum-junction]")!
          .getBoundingClientRect();
        return {
          before,
          widened,
          aligned,
          matrixWidth: matrix.offsetWidth,
          centered:
            Math.abs(m.left + m.width / 2 - (sum.left + sum.width / 2)) < 1,
          afterSum: m.top >= sum.bottom,
          rowCount: rows.length,
          overflow: [...el.querySelectorAll<HTMLElement>("div,span")]
            .filter(
              (n) => n.clientWidth > 0 && n.scrollWidth > n.clientWidth + 2,
            )
            .map((n) => n.textContent?.slice(0, 60)),
        };
      });
      expect(Math.max(...values.before)).toBeLessThan(90);
      expect(values.widened).toEqual(values.before);
      expect(values.matrixWidth).toBeLessThan(350);
      expect(values.aligned).toBe(true);
      expect(values.centered).toBe(true);
      expect(values.afterSum).toBe(true);
      expect(values.rowCount).toBe(layer === 40 ? 1 : 3);
      expect(values.overflow).toEqual([]);
      console.log(`mHC ${layer} ${branch}`, values);
      if (layer === 1 || layer === 40) {
        await module.screenshot({
          path: `artifacts/mhc-output-${layer}-${branch}.png`,
        });
        await root.locator("[data-mhc-pre-output]").screenshot({
          path: `artifacts/mhc-output-detail-${layer}-${branch}.png`,
        });
      }
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await focus.selectOption("hc-pre-f");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await expect(page.locator(".katex-error")).toHaveCount(0);
});
