import { test, expect } from "@playwright/test";
import { buildGraph } from "../src/compositions/DeepSeekV41Layer";

test("完整复杂层的自动线不穿过无关模块", async ({ page }, info) => {
  await page.goto("/#model=v41&chapter=layer");
  const reports: unknown[] = [];
  for (const layer of [15, 29, 40]) {
    await page
      .getByRole("button", { name: String(layer), exact: true })
      .click();
    await expect
      .poll(() => page.locator("[data-detail-suspended]").count())
      .toBeGreaterThan(45);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    const ids = buildGraph(layer)
      .nodes.filter((n) => !n.parentId)
      .map((n) => n.id);
    const collisions = await page.evaluate((ids) => {
      const nodes = [
        ...document.querySelectorAll<HTMLElement>(".react-flow__node"),
      ]
        .filter((n) => ids.includes(n.dataset.id!))
        .map((n) => ({ id: n.dataset.id, bounds: n.getBoundingClientRect() }));
      const inside = (point: DOMPoint, b: DOMRect, margin: number) =>
        point.x > b.left + margin &&
        point.x < b.right - margin &&
        point.y > b.top + margin &&
        point.y < b.bottom - margin;
      const hits: string[] = [];
      for (const edge of document.querySelectorAll<HTMLElement>(
        ".react-flow__edge",
      )) {
        const path = edge.querySelector<SVGPathElement>(
            ".react-flow__edge-path",
          ),
          matrix = path?.getScreenCTM();
        if (!path || !matrix) continue;
        const points = [
          ...(path.getAttribute("d") ?? "").matchAll(
            /[ML]\s*([-\d.]+)\s+([-\d.]+)/g,
          ),
        ].map((match) => ({ x: Number(match[1]), y: Number(match[2]) }));
        for (let i = 1; i < points.length - 1; i++) {
          const a = points[i - 1],
            b = points[i],
            c = points[i + 1];
          if ((b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y) < -0.01)
            hits.push(`${edge.dataset.id} / 反向折返`);
        }
        const length = path.getTotalLength(),
          at = (distance: number) =>
            path.getPointAtLength(distance).matrixTransform(matrix);
        const obstacles = nodes.filter(
          (node) =>
            !inside(at(0), node.bounds, -4) &&
            !inside(at(length), node.bounds, -4),
        );
        for (const obstacle of obstacles) {
          for (let distance = 8; distance < length - 8; distance += 8) {
            if (inside(at(distance), obstacle.bounds, 2)) {
              hits.push(`${edge.dataset.id} / ${obstacle.id}`);
              break;
            }
          }
        }
      }
      return hits;
    }, ids);
    reports.push({ layer, collisions });
  }
  console.log("全图连线避障", JSON.stringify(reports));
  await info.attach("route-audit.json", {
    body: JSON.stringify(reports, null, 2),
    contentType: "application/json",
  });
  for (const report of reports as { collisions: string[] }[])
    expect(report.collisions).toEqual([]);
});
