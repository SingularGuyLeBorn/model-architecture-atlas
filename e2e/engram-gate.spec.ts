import { test, expect } from "@playwright/test";

test("Engram 只在第 2、15 层出现，乘积框真实接线且标题放大", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 2200, height: 2400 });
  await page.goto("/#model=v41&chapter=layer");
  const focus = page.getByRole("combobox", { name: "定位模块" });
  for (const layer of [1, 2, 3, 15]) {
    await page
      .getByRole("button", { name: String(layer), exact: true })
      .click();
    await expect(focus.locator('option[value="engram-inject"]')).toHaveCount(
      [2, 15].includes(layer) ? 1 : 0,
    );
    if (![2, 15].includes(layer)) continue;
    for (const phase of ["Prefill · 整段矩阵", "Decode · 单步一行"]) {
      await page.getByRole("button", { name: phase, exact: true }).click();
      await focus.selectOption("engram-inject");
      const node = page.locator('.react-flow__node[data-id="engram-inject"]');
      await expect(node.locator("[data-engram-dot-product]")).toHaveCount(3);
      await expect
        .poll(() =>
          node.locator("[data-engram-dot-sum]").evaluate((el) => {
            const rows = [...el.querySelectorAll("[data-engram-dot-product]")];
            return rows.every((row, i) => {
              const rect = row.getBoundingClientRect();
              const wire = el.querySelector(
                `[data-sum-input="${i}"]`,
              ) as SVGPathElement;
              const point = wire
                .getPointAtLength(0)
                .matrixTransform(wire.getScreenCTM()!);
              return (
                Math.abs(point.x - rect.right) < 1 &&
                Math.abs(point.y - (rect.top + rect.bottom) / 2) < 1
              );
            });
          }),
        )
        .toBe(true);
      expect(
        await node
          .locator("[data-module-title]")
          .evaluateAll((els) =>
            els.every((el) => parseFloat(getComputedStyle(el).fontSize) >= 19),
          ),
      ).toBe(true);
      const outputGap = await node
        .locator("[data-engram-dot-sum]")
        .evaluate((el) => {
          const wire = el.querySelector("[data-sum-output]") as SVGPathElement;
          const end = wire
            .getPointAtLength(wire.getTotalLength())
            .matrixTransform(wire.getScreenCTM()!);
          const result = el
            .querySelector("[data-engram-dot-result]")!
            .getBoundingClientRect();
          return Math.hypot(
            end.x - result.left,
            end.y - (result.top + result.bottom) / 2,
          );
        });
      expect(outputGap, "求和输出直接连接缩放点积框").toBeLessThan(1);
      await expect(node.locator(".katex-error")).toHaveCount(0);
      await node.screenshot({
        path: `artifacts/engram-${layer}-${phase.startsWith("Prefill") ? "prefill" : "decode"}.png`,
      });
      await node
        .locator("[data-engram-dot-sum]")
        .screenshot({ path: `artifacts/engram-${layer}-sum.png` });
    }
  }
});
