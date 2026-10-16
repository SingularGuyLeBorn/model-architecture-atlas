import { test, expect } from "@playwright/test";

test("紧凑归一化保留两段连接，真实内容不溢出且下游跟随高度", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/#model=v41&chapter=layer");
  const focus = page.getByRole("combobox", { name: "定位模块" });
  const reports: unknown[] = [];
  for (const [layer, phase] of [
    [1, "Prefill"],
    [15, "Prefill"],
    [29, "Decode"],
  ] as const) {
    await page
      .getByRole("button", { name: String(layer), exact: true })
      .click();
    await page
      .getByRole("button", {
        name: `${phase} · ${phase === "Prefill" ? "整段矩阵" : "单步一行"}`,
        exact: true,
      })
      .click();
    await focus.selectOption("q");
    await expect(
      page.locator('[data-rmsnorm="Query 低秩投影"] [data-rmsnorm-transfer]'),
    ).toBeAttached();
    await expect
      .poll(() =>
        page
          .locator('.react-flow__node[data-id="q-rmsnorm"]')
          .evaluate((el) => (el as HTMLElement).offsetHeight),
      )
      .toBeLessThan(850);
    // 原高度来自同浏览器、同字号的改前实测；不靠缩放截图掩盖布局。
    const sizes = await page.locator(".react-flow__node").evaluateAll((nodes) =>
      nodes
        .filter((node) =>
          ["q", "kv", "q-rmsnorm", "swa-window"].includes(
            (node as HTMLElement).dataset.id!,
          ),
        )
        .map((node) => ({
          id: (node as HTMLElement).dataset.id,
          width: (node as HTMLElement).offsetWidth,
          height: (node as HTMLElement).offsetHeight,
        })),
    );
    if (layer === 1) {
      expect(sizes.find((node) => node.id === "q")!.height).toBeLessThan(1450);
      expect(sizes.find((node) => node.id === "kv")!.height).toBeLessThan(1850);
    }
    const check = async () =>
      page.locator("[data-rmsnorm]").evaluateAll((roots) =>
        roots.map((root) => {
          const source = root
            .querySelector("[data-rmsnorm-root-result]")!
            .getBoundingClientRect();
          const target = root
            .querySelector("[data-rmsnorm-broadcast]")!
            .getBoundingClientRect();
          const path = root.querySelector<SVGPathElement>(
            "[data-rmsnorm-transfer] path",
          );
          const matrix = path?.getScreenCTM();
          const firstStage = root
            .querySelector('[data-rmsnorm-stage="root"]')!
            .getBoundingClientRect();
          const sourceBox = root
            .querySelector('[data-rmsnorm-stage="root"] [data-vector-elements]')
            ?.parentElement?.getBoundingClientRect();
          const lineAvoidsInput =
            !path ||
            !matrix ||
            !sourceBox ||
            Array.from({ length: 80 }, (_, i) => {
              const point = path
                .getPointAtLength((path.getTotalLength() * i) / 79)
                .matrixTransform(matrix);
              // 跨段线只许在左段底部横向离开，再进入两段之间的通道。
              return point.y >= source.top - 1 || point.x > firstStage.right;
            }).every(Boolean);
          const start =
            path && matrix
              ? path.getPointAtLength(0).matrixTransform(matrix)
              : null;
          const end =
            path && matrix
              ? path
                  .getPointAtLength(path.getTotalLength())
                  .matrixTransform(matrix)
              : null;
          return {
            lineAvoidsInput,
            label: root.getAttribute("data-rmsnorm"),
            overflow: [...root.querySelectorAll<HTMLElement>("div")]
              .filter(
                (el) =>
                  el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 2,
              )
              .map((el) => ({
                text: el.textContent?.slice(0, 60),
                width: el.clientWidth,
                scrollWidth: el.scrollWidth,
              })),
            sourceGap: start
              ? Math.hypot(
                  start.x - source.right,
                  start.y - source.top - source.height / 2,
                )
              : 999,
            targetGap: end
              ? Math.hypot(
                  end.x - target.left,
                  end.y - target.top - target.height / 2,
                )
              : 999,
          };
        }),
      );
    await expect
      .poll(async () => (await check()).flatMap((result) => result.overflow))
      .toEqual([]);
    await expect
      .poll(async () =>
        (await check()).every(
          (result) =>
            result.sourceGap < 2 &&
            result.targetGap < 2 &&
            result.lineAvoidsInput,
        ),
      )
      .toBe(true);
    reports.push({ layer, phase, sizes, norms: await check() });
    expect(
      await page
        .locator("[data-rotary-process] div")
        .evaluateAll((elements) =>
          elements
            .filter(
              (element) =>
                element.clientWidth > 0 &&
                element.scrollWidth > element.clientWidth + 2,
            )
            .map((element) => element.textContent?.slice(0, 80)),
        ),
    ).toEqual([]);
    const collisions = await page.evaluate(() => {
      const nodes = [
        ...document.querySelectorAll<HTMLElement>(".react-flow__node"),
      ]
        .filter((node) => ["q", "kv", "compressor"].includes(node.dataset.id!))
        .map((node) => ({
          id: node.dataset.id,
          rect: node.getBoundingClientRect(),
        }));
      const inside = (p: DOMPoint, r: DOMRect, margin: number) =>
        p.x > r.left + margin &&
        p.x < r.right - margin &&
        p.y > r.top + margin &&
        p.y < r.bottom - margin;
      const hits: string[] = [];
      for (const edge of document.querySelectorAll<HTMLElement>(
        ".react-flow__edge",
      )) {
        const path = edge.querySelector<SVGPathElement>(
          ".react-flow__edge-path",
        );
        if (!path) continue;
        const length = path.getTotalLength(),
          transform = path.getScreenCTM();
        if (!length || !transform) continue;
        const at = (distance: number) =>
          path.getPointAtLength(distance).matrixTransform(transform);
        const from = at(0),
          to = at(length);
        const obstacles = nodes.filter(
          (node) => !inside(from, node.rect, -4) && !inside(to, node.rect, -4),
        );
        for (let distance = 10; distance < length - 10; distance += 10) {
          const p = at(distance);
          for (const node of obstacles)
            if (inside(p, node.rect, 3)) {
              hits.push(`${edge.dataset.id} → ${node.id}`);
              break;
            }
          if (hits.at(-1)?.startsWith(`${edge.dataset.id} →`)) break;
        }
      }
      return hits;
    });
    expect(collisions).toEqual([]);
    await page.screenshot({ path: `artifacts/compact-${layer}-${phase}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await focus.selectOption("q");
  await expect(page.locator('[data-rmsnorm="Query 低秩投影"]')).toBeAttached();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page.screenshot({ path: "artifacts/compact-mobile.png" });
  await expect(page.locator(".katex-error")).toHaveCount(0);
  expect(errors).toEqual([]);
  console.log(JSON.stringify(reports));
});
