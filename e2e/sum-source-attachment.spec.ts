import { test, expect } from "@playwright/test";

test("所有纵向求和线贴合真实输入，乘积行与省略行保持紧凑", async ({ page }) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 2600, height: 2100 });
  await page.goto("/#model=v41&chapter=layer");
  const focus = page.getByRole("combobox", { name: "定位模块" });
  for (const layer of [1, 15, 29, 40]) {
    await page
      .getByRole("button", { name: String(layer), exact: true })
      .click();
    await page
      .getByRole("button", {
        name: layer >= 29 ? "Decode · 单步一行" : "Prefill · 整段矩阵",
        exact: true,
      })
      .click();
    for (const id of ["heads", "add1", "add2", "hc-mix-a", "hc-mix-f"]) {
      await focus.selectOption(id);
      const node = page.locator(`.react-flow__node[data-id="${id}"]`);
      await expect(node.locator("[data-detail-suspended]")).toHaveCount(0);
      await expect
        .poll(() =>
          node.evaluate((root) => {
            const failures: string[] = [];
            for (const sum of root.querySelectorAll<HTMLElement>(
              "[data-stacked-sum]",
            )) {
              const scale = sum.getBoundingClientRect().width / sum.offsetWidth;
              for (const path of sum.querySelectorAll<SVGPathElement>(
                "[data-sum-input]",
              )) {
                const index = path.getAttribute("data-sum-input");
                const segments = path
                  .getAttribute("d")!
                  .match(/^M0 ([\d.-]+) H([\d.-]+) V([\d.-]+) H([\d.-]+)$/);
                const straight = path
                  .getAttribute("d")!
                  .match(/^M0 ([\d.-]+) H([\d.-]+)$/);
                if (
                  !straight &&
                  (!segments ||
                    Number(segments[2]) < 12 ||
                    Number(segments[4]) - Number(segments[2]) < 10)
                )
                  failures.push(`右侧出线或箭头净空不足: ${index}`);
                const row = sum.querySelector(`[data-sum-operand="${index}"]`)!;
                const operand =
                  row.querySelector(
                    "[data-attention-tensor], [data-feature-vector]",
                  ) ?? row.firstElementChild!;
                const bounds = operand.getBoundingClientRect();
                const start = path
                  .getPointAtLength(0)
                  .matrixTransform(path.getScreenCTM()!);
                if (
                  Math.abs(start.x - bounds.right) / scale > 1.5 ||
                  Math.abs(start.y - bounds.top - bounds.height / 2) / scale >
                    1.5
                )
                  failures.push(`断线: ${index}`);
                const product = row.firstElementChild!;
                if (product !== operand) {
                  const parts = [...product.children].map((el) =>
                    el.getBoundingClientRect(),
                  );
                  for (let i = 1; i < parts.length; i++)
                    if ((parts[i].left - parts[i - 1].right) / scale > 14)
                      failures.push(`乘积行空白: ${index}`);
                }
              }
              const omitted = sum.querySelector("[data-sum-omitted]");
              if (
                omitted &&
                omitted.getBoundingClientRect().height / scale > 20
              )
                failures.push("省略行过高");
            }
            return failures;
          }),
        )
        .toEqual([]);
      expect(
        await node
          .locator("div")
          .evaluateAll((elements) =>
            elements
              .filter(
                (el) =>
                  el.clientWidth > 0 &&
                  !el.querySelector(".react-flow__handle") &&
                  el.scrollWidth > el.clientWidth + 2,
              )
              .map((el) => el.textContent?.slice(0, 60)),
          ),
      ).toEqual([]);
      if (layer === 15) {
        const detail = node.locator("[data-stacked-sum]").first();
        if (await detail.count())
          await detail.screenshot({ path: `artifacts/sum-source-${id}.png` });
      }
    }
  }
});
