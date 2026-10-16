import { test, expect } from "@playwright/test";

test("Indexer 来源、候选列归约与 S 行列含义", async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 2600, height: 2200 });
  await page.goto("/#model=v41&chapter=layer");
  await page.getByRole("button", { name: "收起左栏", exact: true }).click();
  for (const [layer, phase] of [
    [3, "Prefill · 整段矩阵"],
    [15, "Prefill · 整段矩阵"],
    [29, "Decode · 单步一行"],
  ] as const) {
    await page
      .getByRole("button", { name: String(layer), exact: true })
      .click();
    await page.getByRole("button", { name: phase, exact: true }).click();
    const focus = page.getByRole("combobox", { name: "定位模块" });
    await focus.selectOption("concat");
    await focus.selectOption("indexer");
    const node = page.locator('.react-flow__node[data-id="indexer"]');
    await expect(node.locator("[data-index-score-column]")).toHaveCount(3);
    await expect(
      node.locator("[data-index-score-columns] [data-sum-input]"),
    ).toHaveCount(9);
    await expect(node.locator('[data-handleid="weight-input"]')).toHaveCount(1);
    await expect(page.locator('[data-id="norm-index-weights"]')).toHaveCount(1);
    await expect(
      node.locator("[data-index-input-origin]").nth(1),
    ).toContainText("四路残差");
    await expect(node.locator("[data-index-score-axes]")).toContainText(
      "每一行独立选 Top-K",
    );
    await expect(node.locator(".katex-error")).toHaveCount(0);
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    const problems = await node
      .locator(
        "[data-index-score-column], [data-index-projection], [data-index-result-flow]",
      )
      .evaluateAll((regions) =>
        regions.flatMap((region) => {
          const bounds = region.getBoundingClientRect();
          return [...region.querySelectorAll<HTMLElement>("[aria-label]")]
            .filter((el) => {
              const b = el.getBoundingClientRect();
              return (
                b.left < bounds.left - 1 ||
                b.right > bounds.right + 1 ||
                b.bottom > bounds.bottom + 1
              );
            })
            .map((el) => el.getAttribute("aria-label"));
        }),
      );
    expect(problems).toEqual([]);
    const gaps = await node
      .locator("[data-index-score-column]")
      .evaluateAll((regions) =>
        regions.map((region) => {
          const line =
            region.querySelector<SVGPathElement>("[data-sum-output]")!;
          const end = line.getPointAtLength(line.getTotalLength());
          const point = new DOMPoint(end.x, end.y).matrixTransform(
            line.getScreenCTM()!,
          );
          const result = region
            .querySelector("[data-index-score-cell]")!
            .getBoundingClientRect();
          return Math.abs(point.x - result.left);
        }),
      );
    for (const gap of gaps) expect(gap).toBeLessThan(2);
    for (const [name, selector] of [
      ["sources", "[data-index-projections]"],
      ["scores", "[data-index-score-columns]"],
      ["matrix", "[data-index-result-flow]"],
    ] as const) {
      const target = node.locator(selector);
      const bounds = (await target.boundingBox())!;
      await page.mouse.move(1300, 1100);
      await page.mouse.down({ button: "middle" });
      await page.mouse.move(
        2600 - bounds.x - bounds.width / 2,
        2200 - bounds.y - bounds.height / 2,
        { steps: 5 },
      );
      await page.mouse.up({ button: "middle" });
      await expect(target).toBeInViewport({ ratio: 0.999 });
      await page.screenshot({
        path: `artifacts/indexer-${layer}-${name}.png`,
        clip: (await target.boundingBox())!,
      });
    }
  }
});
