import { test, expect } from "@playwright/test";
import { buildGraph } from "../src/compositions/DeepSeekV41Layer";

test("变量标签沿线拖动、撤销、改字和保存后仍可避让", async ({ page }) => {
  test.setTimeout(25000);
  await page.setViewportSize({ width: 2000, height: 1400 });
  await page.goto("/#model=v41&chapter=layer");
  await page.getByRole("button", { name: "15", exact: true }).click();
  await page
    .getByRole("combobox", { name: "定位模块" })
    .selectOption("global-select");
  const label = page.locator('[data-edge-label="select-merge"]');
  const before = await label.getAttribute("style");
  const r = (await label.boundingBox())!;
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width / 2 + 80, r.y + r.height / 2, {
    steps: 8,
  });
  await page.mouse.up();
  await expect.poll(() => label.getAttribute("style")).not.toBe(before);
  await page.keyboard.press("Control+z");
  await expect.poll(() => label.getAttribute("style")).toBe(before);
  await label.click();
  const field = page.getByPlaceholder("例如 Q_{3,1}");
  await expect(field).toBeVisible();
  await field.fill("G_{15}^{\\mathrm{cache}}");
  await field.blur();
  await expect(label).toHaveAttribute("aria-label", "G_{15}^{\\mathrm{cache}}");
  await expect(page.locator("[data-label-unresolved]")).toHaveCount(0);
  await page.getByRole("button", { name: "保存到本机", exact: true }).click();
  const saved = await page.evaluate(() =>
    JSON.parse(
      localStorage.getItem(
        "model-atlas:deepseek-v41-layer-layout:v12:prefill:15",
      )!,
    ),
  );
  expect(JSON.stringify(saved)).toContain("cache");
});

test("整页变量标签不压框、不压线、不重叠，长线有终端标注", async ({
  page,
}, info) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 2000, height: 1400 });
  await page.goto("/#model=v41&chapter=layer");
  const reports: unknown[] = [];
  for (const [layer, width] of [
    [1, 2000],
    [15, 2000],
    [29, 2000],
    [40, 2000],
    [15, 1000],
  ]) {
    await page.setViewportSize({ width, height: 1400 });
    await page
      .getByRole("button", { name: String(layer), exact: true })
      .click();
    const phase = layer >= 29 ? "decode" : "prefill";
    await page
      .getByRole("button", {
        name: phase === "decode" ? "Decode · 单步一行" : "Prefill · 整段矩阵",
        exact: true,
      })
      .click();
    const focus = page.getByRole("combobox", { name: "定位模块" });
    const modules = await focus
      .locator("option")
      .evaluateAll((options) =>
        options
          .map((option) => (option as HTMLOptionElement).value)
          .filter(Boolean),
      );
    for (const module of modules) {
      await focus.selectOption(module);
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      const graph = buildGraph(layer, new Map(), phase);
      const result = await page.evaluate(
        ({ ids, edgeIds, targets }) => {
          const labels = [
            ...document.querySelectorAll<HTMLElement>(
              "[data-edge-label], [data-edge-terminal-label]",
            ),
          ].map((el) => ({
            id: el.dataset.edgeLabel ?? el.dataset.edgeTerminalLabel!,
            terminal: !!el.dataset.edgeTerminalLabel,
            r: el.getBoundingClientRect(),
          }));
          const boxes = [
            ...document.querySelectorAll<HTMLElement>(".react-flow__node"),
          ]
            .filter((el) => ids.includes(el.dataset.id!))
            .map((el) => ({
              id: el.dataset.id!,
              r: el.getBoundingClientRect(),
            }));
          const intersect = (a: DOMRect, b: DOMRect) =>
            Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
            Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
          const failures: string[] = [];
          for (const el of document.querySelectorAll<HTMLElement>(
            "[data-label-unresolved]",
          ))
            failures.push(`${el.dataset.edgeLabel} 无安全标签位置`);
          for (const label of labels)
            for (const box of boxes)
              if (intersect(label.r, box.r))
                failures.push(
                  `${label.id}${label.terminal ? "末端" : "主标"} 压框 ${box.id}`,
                );
          for (let i = 0; i < labels.length; i++)
            for (let j = i + 1; j < labels.length; j++)
              if (intersect(labels[i].r, labels[j].r))
                failures.push(`${labels[i].id} 标签重叠 ${labels[j].id}`);
          for (const edge of document.querySelectorAll<HTMLElement>(
            ".react-flow__edge",
          )) {
            const path = edge.querySelector<SVGPathElement>(
              ".react-flow__edge-path",
            );
            if (!path) continue;
            const matrix = path.getScreenCTM()!;
            const commands = [
              ...path
                .getAttribute("d")!
                .matchAll(/([ML])\s*([-\d.]+)\s+([-\d.]+)/g),
            ];
            let prev: DOMPoint | undefined;
            for (const c of commands) {
              const point = new DOMPoint(
                Number(c[2]),
                Number(c[3]),
              ).matrixTransform(matrix);
              if (c[1] === "L" && prev)
                for (const label of labels) {
                  const r = label.r;
                  if (
                    Math.abs(point.x - prev.x) < 0.1
                      ? point.x > r.left + 1 &&
                        point.x < r.right - 1 &&
                        Math.max(point.y, prev.y) > r.top + 1 &&
                        Math.min(point.y, prev.y) < r.bottom - 1
                      : point.y > r.top + 1 &&
                        point.y < r.bottom - 1 &&
                        Math.max(point.x, prev.x) > r.left + 1 &&
                        Math.min(point.x, prev.x) < r.right - 1
                  )
                    failures.push(`${label.id} 压线 ${edge.dataset.id}`);
                }
              prev = point;
            }
            if (
              path.getTotalLength() > 600 &&
              edgeIds.includes(edge.dataset.id!)
            ) {
              if (!labels.some((l) => l.id === edge.dataset.id))
                failures.push(`${edge.dataset.id} 长线无变量`);
              else if (
                !labels.some((l) => l.id === edge.dataset.id && l.terminal)
              )
                failures.push(`${edge.dataset.id} 长线无末端变量`);
              else {
                const terminal = labels.find(
                  (l) => l.id === edge.dataset.id && l.terminal,
                )!;
                const target = document
                  .querySelector<HTMLElement>(
                    `.react-flow__node[data-id="${targets[edge.dataset.id!]}"]`,
                  )!
                  .getBoundingClientRect();
                const points = commands.map((c) =>
                  new DOMPoint(Number(c[2]), Number(c[3])).matrixTransform(
                    matrix,
                  ),
                );
                let entry = points.at(-1)!;
                // 内部端口以外框入口为邻近基准，外框内已有同名张量，不把标签压到结构上。
                for (let i = points.length - 2; i >= 0; i--) {
                  const a = points[i],
                    b = points[i + 1];
                  if (
                    a.x < target.left ||
                    a.x > target.right ||
                    a.y < target.top ||
                    a.y > target.bottom
                  ) {
                    entry =
                      Math.abs(a.x - b.x) < 0.1
                        ? new DOMPoint(
                            b.x,
                            Math.max(target.top, Math.min(target.bottom, a.y)),
                          )
                        : new DOMPoint(
                            Math.max(target.left, Math.min(target.right, a.x)),
                            b.y,
                          );
                    break;
                  }
                }
                const distance =
                  Math.hypot(
                    (terminal.r.left + terminal.r.right) / 2 - entry.x,
                    (terminal.r.top + terminal.r.bottom) / 2 - entry.y,
                  ) / matrix.a;
                if (distance > 200)
                  failures.push(
                    `${edge.dataset.id} 末端变量距入口过远 ${Math.round(distance)}px`,
                  );
              }
            }
          }
          return { labels: labels.length, failures: [...new Set(failures)] };
        },
        {
          ids: graph.nodes.filter((n) => !n.parentId).map((n) => n.id),
          edgeIds: graph.edges.map((e) => e.id),
          targets: Object.fromEntries(graph.edges.map((e) => [e.id, e.target])),
        },
      );
      reports.push({ layer, width, module, ...result });
      if (
        layer === 15 &&
        ["heads", "global-select", "add2", "experts", "next-inputs"].includes(
          module,
        )
      )
        await page.screenshot({
          path: `artifacts/label-audit-${layer}-${width}-${module}.png`,
        });
    }
  }
  console.log("全页标签审查", JSON.stringify(reports));
  await info.attach("edge-label-audit.json", {
    body: JSON.stringify(reports, null, 2),
    contentType: "application/json",
  });
  for (const report of reports as { failures: string[] }[])
    expect(report.failures).toEqual([]);
});
