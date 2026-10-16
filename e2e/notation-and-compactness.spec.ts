import { test, expect } from "@playwright/test";

test("简写对应、参数双轴尺寸、Softmax 与专家乘法的阅读回归", async ({
  page,
}) => {
  await page.setViewportSize({ width: 2800, height: 2200 });
  await page.goto("/#model=v41&chapter=layer");
  await page.getByRole("button", { name: "15", exact: true }).click();
  const focus = page.getByRole("combobox", { name: "定位模块" });
  await focus.selectOption("hc-mix-f");
  const mix = page.locator('.react-flow__node[data-id="hc-mix-f"]');
  const cols = mix.locator("[data-mhc-parameter-columns]");
  const sizes = await cols.locator(":scope > div").evaluateAll((cells) =>
    cells.map((el) => {
      const text = el.querySelector("[aria-label]")!.getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      const zoom = rect.width / (el as HTMLElement).offsetWidth;
      return {
        extraWidth: (rect.width - text.width) / zoom,
        extraHeight: (rect.height - text.height) / zoom,
      };
    }),
  );
  expect(sizes).toHaveLength(3);
  for (const size of sizes) {
    expect(size.extraWidth).toBeLessThan(22);
    expect(size.extraHeight).toBeLessThan(16);
  }
  const softmax = mix.locator("[data-mhc-row-normalize]");
  await expect(softmax).toContainText("本行共用的分母");
  await expect(
    softmax.locator("[data-mhc-row-results] [aria-label]"),
  ).toHaveCount(4);
  const formulas = await mix
    .locator("[aria-label]")
    .evaluateAll((es) => es.map((e) => e.getAttribute("aria-label")!));
  expect(
    formulas.filter((s) => s.includes("downarrow") && s.includes("epsilon")),
  ).toEqual([]);
  await softmax.screenshot({ path: "artifacts/notation-softmax.png" });
  await cols
    .locator("..")
    .screenshot({ path: "artifacts/compact-parameter.png" });
  await focus.selectOption("add2");
  const broadcast = page
    .locator(
      '.react-flow__node[data-id="add2"] [data-mhc-elementwise-broadcast]',
    )
    .first();
  await expect(broadcast.locator("[data-notation-alias]")).toContainText(
    "逐项简写",
  );
  await expect(
    broadcast.locator("[data-notation-alias] [aria-label]").first(),
  ).toHaveAttribute(
    "aria-label",
    "o_d:=o_{15,t,d}^{\\mathrm{FFN}},\\quad d=1,\\ldots,5120",
  );
  const wireStyles = await page
    .locator('.react-flow__node[data-id="add2"] [data-stacked-sum]')
    .first()
    .locator('svg [stroke]:not([stroke="transparent"])')
    .evaluateAll((es) =>
      es.map((e) => ({
        width: getComputedStyle(e).strokeWidth,
        scale: getComputedStyle(e).vectorEffect,
      })),
    );
  expect(new Set(wireStyles.map((s) => s.width)).size).toBe(1);
  expect(wireStyles.every((s) => s.scale === "non-scaling-stroke")).toBe(true);
  await broadcast.screenshot({ path: "artifacts/notation-broadcast.png" });
  await focus.selectOption("next-inputs");
  await expect(
    page
      .locator('.react-flow__node[data-id="next-inputs"] [data-notation-alias]')
      .first(),
  ).toContainText("下方四项简写");
  await focus.selectOption("experts");
  const product = page.locator("[data-expert-product]").first();
  await expect(
    product.locator("[data-expert-product-examples] [aria-label]"),
  ).toHaveCount(2);
  await product.screenshot({ path: "artifacts/expert-product-elements.png" });
});

test("专家权重到乘法直连，无窄 U 形粗刺，选中只高亮原线", async ({ page }) => {
  await page.setViewportSize({ width: 2400, height: 1600 });
  await page.goto("/#model=v41&chapter=layer");
  await page
    .getByRole("combobox", { name: "定位模块" })
    .selectOption("moe-sum");
  const edge = page.locator('.react-flow__edge[data-id="expert-gate-shared"]');
  const path = edge.locator(".react-flow__edge-path");
  await expect
    .poll(() => path.getAttribute("d"))
    .toMatch(/^M [\d.]+ [\d.]+ L [\d.]+ [\d.]+$/);
  const target = page.locator(
    '.react-flow__node[data-id="expert-scale-shared"]',
  );
  const pane = await page.locator(".react-flow__pane").boundingBox();
  const bounds = await target.boundingBox();
  await page.mouse.move(
    pane!.x + pane!.width - 30,
    pane!.y + pane!.height - 30,
  );
  await page.mouse.wheel(0, 2 * (bounds!.y - (pane!.y + 360)));
  await expect
    .poll(async () => (await target.boundingBox())!.y)
    .toBeGreaterThan(pane!.y + 200);
  // 总汇合位于专家组中央，先真实平移画布，让左侧共享专家进入可点击区域。
  const blank = await page.evaluate(() => {
    const bounds = document
      .querySelector(".react-flow__pane")!
      .getBoundingClientRect();
    for (let y = bounds.top + 90; y < bounds.bottom - 20; y += 30)
      for (let x = bounds.left + 30; x < bounds.right - 850; x += 30)
        if (
          document
            .elementFromPoint(x, y)
            ?.classList.contains("react-flow__pane")
        )
          return { x, y };
    throw new Error("找不到可平移的空白区域");
  });
  await page.mouse.move(blank.x, blank.y);
  await page.mouse.down();
  await page.mouse.move(blank.x + 850, blank.y, { steps: 12 });
  await page.mouse.up();
  const click = await path.evaluate((el: SVGPathElement) => {
    const point = el
      .getPointAtLength(el.getTotalLength() / 2)
      .matrixTransform(el.getScreenCTM()!);
    return { x: point.x, y: point.y };
  });
  await page.mouse.click(click.x, click.y);
  await expect(edge).toHaveClass(/selected/);
  await expect(path).toHaveCSS("stroke", "rgb(21, 101, 216)");
  await expect(path).toHaveCSS("stroke-dasharray", "none");
  await expect(edge.locator(".react-flow__edge-path")).toHaveCount(1);
  await expect(edge.locator(".react-flow__edge-interaction")).toHaveCSS(
    "stroke-opacity",
    "0",
  );
  await page.mouse.move(10, 10);
  await page.screenshot({ path: "artifacts/expert-weight-straight.png" });
});
