import { test, expect } from "@playwright/test";

test("MiMo Value 代表行直接连到消费行，选中包含线身与箭翼", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 2200, height: 1500 });
  await page.goto("/#model=mimo25&chapter=layer");
  await page
    .locator(".stage-nav button")
    .filter({ hasText: "权重乘对应 V 行" })
    .click();
  const stage = page.locator('[data-stage="weighted"]');
  await expect(stage.locator("[data-object-link]")).toHaveCount(3);
  await expect
    .poll(() =>
      stage.evaluate((root) => {
        const failures: string[] = [];
        for (const group of root.querySelectorAll("[data-object-link]")) {
          const [from, to] = group.getAttribute("data-object-link")!.split(":");
          const source = root
            .querySelector(`[data-trace-object="${from}"]`)!
            .getBoundingClientRect();
          const target = root
            .querySelector(`[data-trace-object="${to}"]`)!
            .getBoundingClientRect();
          const path = group.querySelector("path")! as SVGPathElement;
          const begin = path
            .getPointAtLength(0)
            .matrixTransform(path.getScreenCTM()!);
          const end = path
            .getPointAtLength(path.getTotalLength())
            .matrixTransform(path.getScreenCTM()!);
          if (
            Math.hypot(
              begin.x - source.right,
              begin.y - (source.top + source.height / 2),
            ) > 1.5 ||
            Math.hypot(
              end.x - (target.left + target.width / 2),
              end.y - target.top,
            ) > 1.5
          )
            failures.push(`${from}:${to}`);
        }
        return failures;
      }),
    )
    .toEqual([]);
  await stage.screenshot({ path: info.outputPath("value-rows.png") });
  const wire = stage.locator("[data-object-link]").first();
  const hit = await wire.locator("[data-wire-hit]").evaluate((el) => {
    const p = el as SVGPathElement;
    for (let at = 10; at < p.getTotalLength() - 10; at += 10) {
      const point = p.getPointAtLength(at).matrixTransform(p.getScreenCTM()!);
      if (
        point.x < 0 ||
        point.x >= innerWidth ||
        point.y < 0 ||
        point.y >= innerHeight
      )
        continue;
      if (
        document
          .elementFromPoint(point.x, point.y)
          ?.closest("[data-object-link]") === el.parentElement
      )
        return { x: point.x, y: point.y };
    }
    throw new Error("行连接没有可见命中点");
  });
  await page.mouse.click(hit.x, hit.y);
  await expect(wire).toHaveAttribute("data-internal-selected", "true");
  for (const p of await wire.locator("path:not([data-wire-hit])").all())
    await expect(p).toHaveCSS("stroke", "rgb(21, 101, 216)");
  await expect(stage.locator("[data-internal-selected]")).toHaveCount(1);
  await stage.screenshot({ path: info.outputPath("selected-row-wire.png") });
});

test("跨 SVG 的求和输出点击一段后，另一段与箭头同步高亮", async ({
  page,
}, info) => {
  await page.goto("/#model=v41&chapter=layer");
  await page.setViewportSize({ width: 2400, height: 1800 });
  await page.getByRole("combobox", { name: "定位模块" }).selectOption("add2");
  const sum = page
    .locator('.react-flow__node[data-id="add2"] [data-stacked-sum]')
    .first();
  const parts = sum.locator('[data-wire-key="output"]');
  await expect(parts).toHaveCount(2);
  const point = await parts
    .last()
    .locator("[data-wire-hit]")
    .evaluate((el) => {
      const path = el as SVGPathElement;
      const p = path
        .getPointAtLength(path.getTotalLength() / 2)
        .matrixTransform(path.getScreenCTM()!);
      return { x: p.x, y: p.y };
    });
  await page.mouse.click(point.x, point.y);
  for (const part of await parts.all()) {
    await expect(part).toHaveAttribute("data-internal-selected", "true");
    for (const path of await part.locator("path:not([data-wire-hit])").all())
      await expect(path).toHaveCSS("stroke", "rgb(21, 101, 216)");
  }
  await page.screenshot({ path: info.outputPath("selected-sum-output.png") });
});

test("跨模块折线只在真正终点画箭头，整线同色选中", async ({ page }, info) => {
  await page.goto("/#model=mimo25&chapter=layer");
  await page.getByRole("button", { name: "全图", exact: true }).click();
  const edge = page.locator(".react-flow__edge").first();
  await expect(edge.locator("[data-edge-arrow]")).toHaveCount(1);
  await expect(edge.locator(".react-flow__edge-path")).not.toHaveAttribute(
    "marker-end",
    /.+/,
  );
  const p = await edge.locator(".react-flow__edge-path").evaluate((el) => {
    const path = el as SVGPathElement;
    for (let at = 10; at < path.getTotalLength(); at += 10) {
      const point = path
        .getPointAtLength(at)
        .matrixTransform(path.getScreenCTM()!);
      if (
        document
          .elementFromPoint(point.x, point.y)
          ?.closest(".react-flow__edge") === path.closest(".react-flow__edge")
      )
        return { x: point.x, y: point.y };
    }
    throw new Error("找不到真实可点击的线身");
  });
  await page.mouse.click(p.x, p.y);
  await expect(edge).toHaveClass(/selected/);
  await expect(edge.locator(".react-flow__edge-path")).toHaveCSS(
    "stroke",
    "rgb(21, 101, 216)",
  );
  await expect(edge.locator("marker path")).toHaveCSS(
    "stroke",
    "rgb(21, 101, 216)",
  );
  await page.screenshot({ path: info.outputPath("selected-whole-wire.png") });
});
