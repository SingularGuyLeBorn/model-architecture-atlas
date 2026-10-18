import { test, expect } from "@playwright/test";

test("窄通道的箭头在选中与缩放时保持比例且正常进入专家框", async ({ page }) => {
  await page.setViewportSize({ width: 2200, height: 1600 });
  await page.goto("/#model=v41&chapter=layer");
  await page
    .getByRole("combobox", { name: "定位模块" })
    .selectOption("experts");
  const edge = page.locator('.react-flow__edge[data-id="moe-input-shared"]');
  const path = edge.locator(".react-flow__edge-path");
  await expect(path).toBeAttached();
  // 将左侧入口移入画布中部，截图不得被固定导航遮住。
  const blank = await page.evaluate(() => {
    const pane = document
      .querySelector(".react-flow__pane")!
      .getBoundingClientRect();
    for (let y = pane.top + 80; y < pane.bottom - 20; y += 20)
      for (let x = pane.left + 20; x < pane.right - 500; x += 20)
        if (
          document
            .elementFromPoint(x, y)
            ?.classList.contains("react-flow__pane")
        )
          return { x, y };
    throw new Error("没有可平移的空白区域");
  });
  await page.mouse.move(blank.x, blank.y);
  await page.mouse.down();
  await page.mouse.move(blank.x + 480, blank.y, { steps: 12 });
  await page.mouse.up();
  const measure = () =>
    path.evaluate((element) => {
      const path = element as SVGPathElement;
      const arrow = path
        .closest(".react-flow__edge")!
        .querySelector("[data-edge-arrow]")!;
      const id = arrow.getAttribute("marker-end")!.match(/#([^'")]+)/)![1];
      const marker = document.getElementById(id) as unknown as SVGMarkerElement;
      const matrix = path.getScreenCTM()!;
      const zoom = Math.hypot(matrix.a, matrix.b);
      const length = path.getTotalLength();
      const end = path.getPointAtLength(length).matrixTransform(matrix);
      const click = path.getPointAtLength(length - 16).matrixTransform(matrix);
      const before = path.getPointAtLength(length - 12).matrixTransform(matrix);
      return {
        d: path.getAttribute("d"),
        units: marker.getAttribute("markerUnits"),
        width: marker.markerWidth.baseVal.value,
        height: marker.markerHeight.baseVal.value,
        lineWidth: parseFloat(getComputedStyle(path).strokeWidth),
        zoom,
        end: { x: end.x, y: end.y },
        click: { x: click.x, y: click.y },
        direction: {
          x: (end.x - before.x) / zoom,
          y: (end.y - before.y) / zoom,
        },
      };
    });
  await expect.poll(async () => (await measure()).units).toBe("userSpaceOnUse");
  const before = await measure();
  // 内部端口前的线可能在专家父框下方；只点击实际可命中的线身。
  const hit = await path.evaluate((element) => {
    const p = element as SVGPathElement;
    for (let distance = p.getTotalLength() - 24; distance > 0; distance -= 12) {
      const point = p
        .getPointAtLength(distance)
        .matrixTransform(p.getScreenCTM()!);
      if (
        document
          .elementFromPoint(point.x, point.y)
          ?.closest(".react-flow__edge")
          ?.getAttribute("data-id") === "moe-input-shared"
      )
        return { x: point.x, y: point.y };
    }
    throw new Error("专家输入线没有可见、可点击的线段");
  });
  await page.mouse.click(hit.x, hit.y);
  await expect(edge).toHaveClass(/selected/);
  const selected = await measure();
  const points = [...selected.d!.matchAll(/[ML]\s*([-\d.]+)\s+([-\d.]+)/g)].map(
    (match) => ({ x: Number(match[1]), y: Number(match[2]) }),
  );
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1],
      b = points[i],
      c = points[i + 1];
    expect(
      (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y),
    ).toBeGreaterThanOrEqual(0);
  }
  expect(points.at(-1)!.x - points.at(-2)!.x).toBeGreaterThanOrEqual(24);
  expect(selected.lineWidth).toBe(before.lineWidth);
  await expect(path).toHaveCSS("stroke", "rgb(21, 101, 216)");
  await expect(path).toHaveCSS("stroke-dasharray", "none");
  expect(selected.width).toBe(before.width);
  expect(selected.height).toBe(before.height);
  expect(Math.abs(selected.direction.y)).toBeLessThan(0.1);
  expect(selected.direction.x).toBeCloseTo(12, 1);
  await page.mouse.move(20, 20);
  await expect(
    page.locator(
      '.architecture-edge-endpoint[data-edge-id="moe-input-shared"][data-endpoint="target"]',
    ),
  ).toHaveCSS("opacity", "0");
  // 截取实际窄通道与目标框，不只检查 marker 声明。
  await page.screenshot({
    path: "artifacts/edge-arrow-selected.png",
    clip: {
      x: Math.max(0, selected.end.x - 130),
      y: Math.max(0, selected.end.y - 130),
      width: 400,
      height: 300,
    },
  });
  await page.locator(".react-flow__controls-zoomin").click();
  await expect
    .poll(async () => (await measure()).zoom)
    .toBeGreaterThan(selected.zoom);
  const zoomed = await measure();
  expect(zoomed.width).toBe(selected.width);
  expect(zoomed.height).toBe(selected.height);
  expect(zoomed.units).toBe("userSpaceOnUse");
  await page.mouse.move(20, 20);
  const detail = await measure();
  await page.screenshot({
    path: "artifacts/edge-arrow-detail.png",
    clip: {
      x: Math.max(0, detail.end.x - 160),
      y: Math.max(0, detail.end.y - 160),
      width: 500,
      height: 400,
    },
  });
  const invalid = await page
    .locator("marker.react-flow__arrowhead")
    .evaluateAll(
      (markers) =>
        markers.filter(
          (m) => m.getAttribute("markerUnits") !== "userSpaceOnUse",
        ).length,
    );
  expect(invalid).toBe(0);
  const silu = page.locator("[data-expert-activation]").first();
  await expect(silu.locator("[data-silu-operand]")).toHaveCount(2);
  await expect(silu.locator("[data-sigmoid-steps]")).toHaveCount(0);
  await silu.screenshot({ path: "artifacts/silu-compact.png" });
  await page.setViewportSize({ width: 4600, height: 2200 });
  await page
    .getByRole("combobox", { name: "定位模块" })
    .selectOption("experts");
  const experts = page.locator('.react-flow__node[data-id="experts"]');
  await expect(experts.locator("[data-expert-activation]")).toHaveCount(4);
  await expect(experts.locator("[data-silu-operand]")).toHaveCount(8);
  await expect(experts.locator("[data-sigmoid-steps]")).toHaveCount(0);
  await experts.screenshot({ path: "artifacts/moe-experts-compact.png" });
  for (const mode of ["Prefill", "Decode"]) {
    await page.getByRole("button", { name: new RegExp(mode) }).click();
    await page
      .getByRole("combobox", { name: "定位模块" })
      .selectOption("experts");
    await expect(experts.locator("[data-expert-down-result]")).toHaveCount(4);
    await expect(
      experts.locator("[data-expert-down-projection] svg"),
    ).toHaveCount(0);
    for (const result of await experts
      .locator("[data-expert-down-result]")
      .all()) {
      await expect(result.locator('[aria-label="="]')).toHaveCount(1);
      await expect(result.locator("[data-expert-matrix]")).toBeVisible();
    }
    await experts
      .locator("[data-expert-structure]")
      .first()
      .screenshot({
        path: `artifacts/expert-down-${mode.toLowerCase()}.png`,
      });
  }
});
