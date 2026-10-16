import { test, expect } from "@playwright/test";

test("Indexer 入线拖动不产生折返尾刺或额外连接", async ({ page }) => {
  await page.setViewportSize({ width: 2000, height: 1400 });
  await page.goto("/#model=v41&chapter=layer");
  await page.getByRole("button", { name: "收起左栏", exact: true }).click();
  await page.getByRole("button", { name: "3", exact: true }).click();
  await page
    .getByRole("combobox", { name: "定位模块" })
    .selectOption("indexer");
  const edge = page.locator('.react-flow__edge[data-id="q-low-rank-indexer"]');
  const wire = edge.locator(".react-flow__edge-path");
  await expect(wire).toBeAttached();
  const end = await wire.evaluate((el) => {
    const path = el as SVGPathElement;
    const p = path.getPointAtLength(path.getTotalLength());
    const screen = new DOMPoint(p.x, p.y).matrixTransform(path.getScreenCTM()!);
    return { x: screen.x, y: screen.y };
  });
  await page.mouse.move(1000, 700);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(2000 - end.x, 1500 - end.y, { steps: 5 });
  await page.mouse.up({ button: "middle" });
  const grab = await wire.evaluate((el) => {
    const path = el as SVGPathElement;
    const matches = [
      ...path.getAttribute("d")!.matchAll(/([ML])\s*([-\d.]+)\s+([-\d.]+)/g),
    ];
    for (let i = matches.length - 1; i > 0; i--) {
      if (matches[i][1] !== "L") continue;
      const a = new DOMPoint(
        +matches[i - 1][2],
        +matches[i - 1][3],
      ).matrixTransform(path.getScreenCTM()!);
      const b = new DOMPoint(+matches[i][2], +matches[i][3]).matrixTransform(
        path.getScreenCTM()!,
      );
      if (Math.abs(a.x - b.x) > 0.1) continue;
      for (
        let y = Math.min(b.y - 30, innerHeight - 50);
        y > Math.max(a.y + 20, 220);
        y -= 20
      ) {
        if (a.x < 30 || a.x > innerWidth - 30) continue;
        if (
          document
            .elementFromPoint(a.x, y)
            ?.closest(".react-flow__edge")
            ?.getAttribute("data-id") === "q-low-rank-indexer"
        )
          return { x: a.x, y };
      }
    }
    throw new Error(`未找到 Indexer 入线可拖位置：${path.getAttribute("d")}`);
  });
  const count = await page.locator(".react-flow__edge").count();
  const original = await wire.getAttribute("d");
  const geometry = () =>
    wire.evaluate((el) => {
      const matches = [
        ...el.getAttribute("d")!.matchAll(/([ML])\s*([-\d.]+)\s+([-\d.]+)/g),
      ];
      const segments = matches
        .slice(1)
        .flatMap((p, i) =>
          p[1] === "L"
            ? [{ x1: +matches[i][2], y1: +matches[i][3], x2: +p[2], y2: +p[3] }]
            : [],
        );
      const overlaps = segments.flatMap((a, i) =>
        segments.slice(i + 1).flatMap((b) => {
          const vertical = a.x1 === a.x2 && b.x1 === b.x2 && a.x1 === b.x1;
          const horizontal = a.y1 === a.y2 && b.y1 === b.y2 && a.y1 === b.y1;
          const overlap = vertical
            ? Math.min(Math.max(a.y1, a.y2), Math.max(b.y1, b.y2)) -
              Math.max(Math.min(a.y1, a.y2), Math.min(b.y1, b.y2))
            : horizontal
              ? Math.min(Math.max(a.x1, a.x2), Math.max(b.x1, b.x2)) -
                Math.max(Math.min(a.x1, a.x2), Math.min(b.x1, b.x2))
              : 0;
          return overlap > 0.1 ? [{ a, b, overlap }] : [];
        }),
      );
      return {
        overlaps,
        diagonal: segments.filter((s) => s.x1 !== s.x2 && s.y1 !== s.y2),
        endpoints: [matches[0].slice(2), matches.at(-1)!.slice(2)].map((p) =>
          p.map((n) => Math.round(+n * 100) / 100),
        ),
      };
    });
  const before = await geometry();
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  for (const dx of [15, 50, 90, -60, 0, 90]) {
    await page.mouse.move(grab.x + dx, grab.y, { steps: 3 });
    // 等真实浏览器帧提交，再比较路径，不能只检查松手后的最终数据。
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    expect(await geometry()).toEqual(before);
    await expect(page.locator(".react-flow__edge")).toHaveCount(count);
    await expect(wire).toHaveCount(1);
  }
  await page.mouse.up();
  await expect(wire).not.toHaveAttribute("d", original!);
  const moved = await wire.getAttribute("d");
  // 标签恢复后重新避让，描边断口可能换位置；比较完整折线而不是断口字符串。
  const routeShape = () =>
    wire.evaluate((el) => {
      const points: { x: number; y: number }[] = [];
      for (const match of el
        .getAttribute("d")!
        .matchAll(/[ML]\s*([-\d.]+)\s+([-\d.]+)/g)) {
        const p = {
          x: Math.round(+match[1] * 100) / 100,
          y: Math.round(+match[2] * 100) / 100,
        };
        if (points.at(-1)?.x === p.x && points.at(-1)?.y === p.y) continue;
        while (points.length > 1) {
          const a = points.at(-2)!,
            b = points.at(-1)!;
          if (!((a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y)))
            break;
          points.pop();
        }
        points.push(p);
      }
      return points;
    });
  const movedShape = await routeShape();
  await page.screenshot({ path: "artifacts/indexer-wire-drag.png" });
  await page.screenshot({
    path: "artifacts/indexer-wire-drag-detail.png",
    clip: { x: 830, y: 580, width: 480, height: 300 },
  });
  await page.getByRole("button", { name: "3", exact: true }).focus();
  await page.keyboard.press("Control+z");
  await expect(wire).toHaveAttribute("d", original!);
  await page.keyboard.press("Control+y");
  await expect(wire).toHaveAttribute("d", moved!);
  await page.getByRole("button", { name: "保存到本机", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "3", exact: true }).click();
  await page
    .getByRole("combobox", { name: "定位模块" })
    .selectOption("indexer");
  await expect.poll(routeShape).toEqual(movedShape);
  expect(await geometry()).toEqual(before);
  await expect(page.locator(".react-flow__edge")).toHaveCount(count);
});
