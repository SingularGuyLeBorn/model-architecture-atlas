import { test, expect } from "@playwright/test";

test("内部元素与汇合线可独立点击，关闭面板后保持关闭", async ({ page }) => {
  await page.setViewportSize({ width: 2400, height: 1800 });
  await page.goto("/#model=v41&chapter=layer");
  await page.getByRole("combobox", { name: "定位模块" }).selectOption("add2");
  const node = page.locator('.react-flow__node[data-id="add2"]');
  const sum = node.locator("[data-stacked-sum]").first();
  const cell = sum
    .locator("[data-sum-operand]")
    .first()
    .locator("[data-feature-vector] [data-vector-elements] span[aria-label]")
    .last();
  const zoomBefore = await page
    .locator(".react-flow__viewport")
    .evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);
  await cell.click();
  const panel = page.locator("[data-module-inspector]");
  await expect(panel.locator("[data-internal-explanation]")).toContainText(
    "内部对象",
  );
  await expect(node.locator("[data-internal-selected]")).toHaveCount(1);
  await expect
    .poll(() =>
      page
        .locator(".react-flow__viewport")
        .evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a),
    )
    .toBe(zoomBefore);
  await sum
    .locator("[data-feature-vector]")
    .first()
    .locator("span[aria-label]")
    .first()
    .click();
  await expect(sum.locator("[data-feature-vector]").first()).toHaveAttribute(
    "data-internal-selected",
    "true",
  );
  await page.getByRole("button", { name: "关闭模块解释" }).click();
  // 侧栏收拢会移动画布；等真实宽度到达收拢状态后再采集屏幕坐标。
  await expect(page.locator(".inspector-rail")).toHaveCSS("width", "52px");
  // 采用真实路径的靠近源端位置点击，不派发合成 click。
  const wire = sum.locator('[data-wire-input="0"]');
  const point = await wire.evaluate((path: SVGPathElement) => {
    const p = path.getPointAtLength(8).matrixTransform(path.getScreenCTM()!);
    return { x: p.x, y: p.y };
  });
  await page.mouse.click(point.x, point.y);
  await expect(panel).toBeHidden();
  await expect(panel.locator("..")).toHaveAttribute("inert", "");
  await expect(sum.locator('[data-sum-input="0"]')).toHaveAttribute(
    "data-internal-selected",
    "true",
  );
  await expect(wire).not.toHaveAttribute("data-internal-selected", "true");
  await expect(wire).toHaveCSS("stroke", "rgba(0, 0, 0, 0)");
  await expect(sum.locator('[data-sum-input="0"]')).toHaveCSS(
    "stroke-dasharray",
    "none",
  );
  await page.getByRole("button", { name: "显示解释", exact: true }).click();
  await expect(panel.locator("[data-internal-explanation]")).toContainText(
    "第 1 路输入",
  );
  await sum.locator("[data-sum-node]").click();
  await expect(sum.locator("[data-sum-node]")).toHaveCSS(
    "outline-style",
    "none",
  );
  await expect(sum.locator("[data-sum-node]")).toHaveCSS(
    "border-top-color",
    "rgb(21, 101, 216)",
  );
  await expect(panel.locator("[data-internal-explanation]")).toContainText(
    "各入口传入的操作数",
  );
  await page.screenshot({ path: "artifacts/internal-selection.png" });
  await page.getByRole("button", { name: "15", exact: true }).click();
  await expect(panel.locator("[data-internal-explanation]")).toHaveCount(0);
  await expect(page.locator("[data-internal-selected]")).toHaveCount(0);
});
