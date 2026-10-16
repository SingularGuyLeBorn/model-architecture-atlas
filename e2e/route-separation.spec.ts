import { test, expect } from "@playwright/test";

test("整页外部线段无共线重叠，求和输入落点彼此分开", async ({ page }, info) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 2800, height: 2200 });
  await page.goto("/#model=v41&chapter=layer");
  const reports: unknown[] = [];
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
    const focus = page.getByRole("combobox", { name: "定位模块" });
    const ids = await focus
      .locator("option")
      .evaluateAll((items) =>
        items.map((item) => (item as HTMLOptionElement).value).filter(Boolean),
      );
    const internal: string[] = [];
    let inputs = 0;
    for (const id of ids) {
      await focus.selectOption(id);
      const node = page.locator(`.react-flow__node[data-id="${id}"]`);
      await expect(node.locator("[data-detail-suspended]")).toHaveCount(0);
      const result = await node.evaluate((root) => {
        const failures: string[] = [];
        let count = 0;
        for (const norm of root.querySelectorAll("[data-rmsnorm]")) {
          const path = norm.querySelector<SVGPathElement>(
            "[data-rmsnorm-transfer] path",
          );
          if (!path) continue;
          const commands = path.getAttribute("d")!.match(/H([\d.-]+) V/);
          const matrix = path.getScreenCTM()!;
          const corridorX = new DOMPoint(
            Number(commands?.[1]),
            0,
          ).matrixTransform(matrix).x;
          const left = norm
            .querySelector('[data-rmsnorm-stage="root"]')!
            .getBoundingClientRect();
          const right = norm
            .querySelector('[data-rmsnorm-stage="scale"]')!
            .getBoundingClientRect();
          if (!(corridorX > left.right && corridorX < right.left))
            failures.push("RMSNorm 连线越出两列之间的专用通道");
        }
        for (const sum of root.querySelectorAll(
          "[data-sum-junction], [data-stacked-sum]",
        )) {
          const paths = [
            ...sum.querySelectorAll<SVGPathElement>("[data-sum-input]"),
          ];
          const ends = paths.map((path) =>
            path.getPointAtLength(path.getTotalLength()),
          );
          count += paths.length;
          for (let i = 0; i < ends.length; i++)
            for (let j = i + 1; j < ends.length; j++)
              if (Math.hypot(ends[i].x - ends[j].x, ends[i].y - ends[j].y) < 8)
                failures.push(`入口挤在一起: ${i},${j}`);
        }
        return { failures, count };
      });
      inputs += result.count;
      internal.push(...result.failures.map((f) => `${id}: ${f}`));
      if (layer === 15 && ["swa-window", "compressor"].includes(id))
        await page.screenshot({ path: `artifacts/routing-${id}.png` });
    }
    const external = await page.evaluate(() => {
      type Segment = {
        id: string;
        x1: number;
        y1: number;
        x2: number;
        y2: number;
      };
      const segments: Segment[] = [];
      const failures: string[] = [];
      for (const edge of document.querySelectorAll<HTMLElement>(
        ".react-flow__edge",
      )) {
        const path = edge.querySelector(".react-flow__edge-path");
        let x = 0,
          y = 0;
        for (const command of (path?.getAttribute("d") ?? "").matchAll(
          /([ML])\s*([-\d.]+)\s+([-\d.]+)/g,
        )) {
          const nx = Number(command[2]),
            ny = Number(command[3]);
          if (command[1] === "L" && (nx !== x || ny !== y))
            segments.push({
              id: edge.dataset.id!,
              x1: x,
              y1: y,
              x2: nx,
              y2: ny,
            });
          x = nx;
          y = ny;
        }
      }
      for (let i = 0; i < segments.length; i++)
        for (let j = i + 1; j < segments.length; j++) {
          const a = segments[i],
            b = segments[j];
          if (a.id === b.id) continue;
          const horizontal = a.y1 === a.y2;
          if (horizontal !== (b.y1 === b.y2)) continue;
          const distance = Math.abs(horizontal ? a.y1 - b.y1 : a.x1 - b.x1);
          const overlap = horizontal
            ? Math.min(Math.max(a.x1, a.x2), Math.max(b.x1, b.x2)) -
              Math.max(Math.min(a.x1, a.x2), Math.min(b.x1, b.x2))
            : Math.min(Math.max(a.y1, a.y2), Math.max(b.y1, b.y2)) -
              Math.max(Math.min(a.y1, a.y2), Math.min(b.y1, b.y2));
          if (distance < 8 && overlap > 8)
            failures.push(
              `${a.id} / ${b.id}: 间距 ${distance.toFixed(1)}, 重叠 ${overlap.toFixed(1)} ${JSON.stringify({ a, b })}`,
            );
        }
      return { failures, segments: segments.length };
    });
    reports.push({ layer, inputs, internal, external });
  }
  console.log("全页线间距检查", JSON.stringify(reports));
  await info.attach("route-separation.json", {
    body: JSON.stringify(reports, null, 2),
    contentType: "application/json",
  });
  for (const report of reports as {
    internal: string[];
    external: { failures: string[] };
  }[]) {
    expect(report.internal).toEqual([]);
    expect(report.external.failures).toEqual([]);
  }
});
