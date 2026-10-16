import { test, expect } from "@playwright/test";

test("简单平方合并、汇入线正交、透明矩阵保留有色元素", async ({ page }) => {
  await page.setViewportSize({ width: 2400, height: 1800 });
  await page.goto("/#model=v41&chapter=layer");
  await page.getByRole("button", { name: "15", exact: true }).click();
  const focus = page.getByRole("combobox", { name: "定位模块" });
  for (const id of ["norm1", "hc-mix-f", "concat", "experts"]) {
    await focus.selectOption(id);
    const node = page.locator(`.react-flow__node[data-id="${id}"]`);
    await expect(node.locator("[data-detail-suspended]")).toHaveCount(0);
    for (const cell of await node
      .locator("[data-rmsnorm-square] > div, [data-mhc-square-element]")
      .all()) {
      await expect(cell.locator("[aria-label]")).toHaveCount(1);
      await expect(cell.locator("[aria-label]")).toHaveAttribute(
        "aria-label",
        /\^2$/,
      );
    }
    for (const path of await node.locator("[data-sum-input]").all()) {
      await expect(path).toHaveAttribute("d", /^M[^LQC]*[HV]/);
    }
    if (id === "hc-mix-f") {
      await expect(node.locator("[data-mhc-sigmoid] [aria-label]")).toHaveCount(
        1,
      );
      await expect(
        node.locator("[data-mhc-sigmoid] [aria-label]"),
      ).toHaveAttribute("aria-label", "\\sigma(a)=\\frac{1}{1+e^{-a}}");
    }
    if (id === "concat") {
      const tensors = node.locator("[data-attention-tensor]");
      const colors = await tensors.evaluateAll((frames) =>
        frames.map((frame) => {
          const cells = [...frame.querySelectorAll<HTMLElement>("span")].filter(
            (cell) => cell.style.borderRadius === "4px" && cell.style.border,
          );
          return {
            parent: getComputedStyle(frame).backgroundColor,
            fills: cells.map((cell) => getComputedStyle(cell).backgroundColor),
          };
        }),
      );
      expect(colors.length).toBeGreaterThan(6);
      for (const matrix of colors) {
        expect(matrix.parent).toBe("rgba(0, 0, 0, 0)");
        expect(matrix.fills.length).toBeGreaterThan(3);
        for (const fill of matrix.fills) {
          expect(fill).not.toBe("rgba(0, 0, 0, 0)");
          expect(fill).not.toBe("rgb(255, 255, 255)");
          expect(
            Math.min(...fill.match(/\d+/g)!.map(Number)),
          ).toBeLessThanOrEqual(231);
        }
      }
    }
    await node.screenshot({ path: `artifacts/simple-operators-${id}.png` });
  }
  await expect(page.locator(".katex-error")).toHaveCount(0);
});
