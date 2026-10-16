import { test, expect } from "@playwright/test";

test("投影参数有来源，层间状态与权重分框，求和输入箭头贴合圆边", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 2200, height: 1700 });
  await page.goto("/#model=v41&chapter=layer");
  const focus = page.getByRole("combobox", { name: "定位模块" });
  for (const target of ["concat", "heads", "add2", "output"]) {
    await focus.selectOption(target);
    const node = page.locator(`.react-flow__node[data-id="${target}"]`);
    await expect(node).toBeVisible();
    await expect
      .poll(() =>
        node.locator("div").evaluateAll((elements) =>
          elements
            .filter(
              // 透明端口命中区允许越过框边；单独检查其内部可见内容。
              (e) =>
                !e.querySelector(".react-flow__handle") &&
                e.clientWidth > 0 &&
                e.scrollWidth > e.clientWidth + 2,
            )
            .map((e) => e.textContent?.slice(0, 90)),
        ),
      )
      .toEqual([]);
    if (target === "concat")
      await expect(
        node.locator("[data-projection-parameter-origin]"),
      ).toContainText("推理时从模型权重加载");
    if (target === "heads") {
      await expect(
        node.locator("[data-attention-value-sum] [data-sum-omitted]"),
      ).toHaveCount(3);
      await expect(
        node.locator("[data-attention-value-sum] [data-sum-input-arrow]"),
      ).toHaveCount(9);
      expect(
        await node
          .locator("[data-attention-value-sum] [aria-label]")
          .evaluateAll((es) =>
            es.some((e) => e.getAttribute("aria-label")?.includes("+\\cdots+")),
          ),
      ).toBe(false);
    }
    if (target === "add2") {
      await expect(node.locator("[data-mhc-parallel-example]")).toHaveCSS(
        "justify-self",
        "start",
      );
      const example = await node
        .locator("[data-mhc-parallel-example]")
        .boundingBox();
      const bounds = await node.boundingBox();
      expect(example!.width).toBeLessThan(bounds!.width / 2);
    }
    // 以真实页面坐标核对每个输入线的终点在圆边；箭头不得被圆遮住。
    await expect
      .poll(() =>
        node.evaluate((root) => {
          const results: number[] = [];
          for (const sum of root.querySelectorAll(
            "[data-sum-junction], [data-stacked-sum]",
          )) {
            const circle = sum
              .querySelector("[data-sum-circle]")!
              .getBoundingClientRect();
            for (const path of sum.querySelectorAll<SVGPathElement>(
              "[data-sum-input]",
            )) {
              const point = path
                .getPointAtLength(path.getTotalLength())
                .matrixTransform(path.getScreenCTM()!);
              results.push(
                Math.abs(
                  Math.hypot(
                    point.x - circle.x - circle.width / 2,
                    point.y - circle.y - circle.height / 2,
                  ) -
                    circle.width / 2,
                ),
              );
            }
          }
          return results.every((gap) => gap < 1.5);
        }),
      )
      .toBe(true);
    if (target === "output") {
      await expect(
        node.locator(
          "[data-layer-pre-output] .react-flow__handle[data-handleid=coefficients]",
        ),
      ).toHaveCount(1);
      await expect(
        node.locator(
          "[data-layer-state-output] .react-flow__handle[data-handleid=main-in]",
        ),
      ).toHaveCount(1);
      await expect(node.locator("[data-layer-next-use]")).toContainText(
        "Layer 2 Engram",
      );
    }
    await page.screenshot({ path: `artifacts/handoff-${target}.png` });
  }
  await page.getByRole("button", { name: "40", exact: true }).click();
  await page
    .getByRole("button", { name: "Decode · 单步一行", exact: true })
    .click();
  await focus.selectOption("output");
  await expect(page.locator("[data-layer-next-use]")).toContainText("主干末尾");
  await expect(page.locator("[data-layer-next-use]")).not.toContainText(
    "Layer 41",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await expect(page.locator(".katex-error")).toHaveCount(0);
  expect(errors).toEqual([]);
});
