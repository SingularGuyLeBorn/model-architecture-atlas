import { test, expect } from "@playwright/test";

const samePath = (actual: string | null, expected: string | null) => {
  if (!actual || !expected) return actual === expected;
  const numbers = /-?\d+(?:\.\d+)?/g;
  if (actual.replace(numbers, "#") !== expected.replace(numbers, "#"))
    return false;
  const a = actual.match(numbers)!.map(Number);
  const b = expected.match(numbers)!.map(Number);
  // [OM-FREEPLAY] 浏览器重载后的子像素舍入允许 0.02 世界像素；命令与点数仍须完全一致。
  return (
    a.length === b.length &&
    a.every((value, i) => Math.abs(value - b[i]) <= 0.02)
  );
};

test("直接拖线与终端标签，焦点离开画布仍可撤销重做并保存", async ({ page }) => {
  await page.setViewportSize({ width: 2000, height: 1400 });
  await page.goto("/#model=v41&chapter=layer");
  const focus = page.getByRole("combobox", { name: "定位模块" });
  await focus.selectOption("kv");
  await page.mouse.move(1000, 750);
  await page.mouse.wheel(0, -300);
  const terminal = page.locator('[data-edge-terminal-label="norm-kv"]');
  await expect(terminal).toBeVisible();
  const before = await terminal.getAttribute("style");
  const box = (await terminal.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 60, {
    steps: 8,
  });
  await page.mouse.up();
  await expect.poll(() => terminal.getAttribute("style")).not.toBe(before);
  const moved = await terminal.getAttribute("style");
  // 页面顶部的层按钮在画布外，不能靠标签仍持有焦点才让快捷键通过。
  await page.getByRole("button", { name: "1", exact: true }).focus();
  await page.keyboard.press("Control+z");
  await expect.poll(() => terminal.getAttribute("style")).toBe(before);
  await page.keyboard.press("Control+y");
  await expect.poll(() => terminal.getAttribute("style")).toBe(moved);
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+Shift+z");
  await expect.poll(() => terminal.getAttribute("style")).toBe(moved);

  const blank = await page.evaluate(() => {
    for (let y = 400; y < innerHeight - 30; y += 80)
      for (let x = innerWidth - 50; x > 300; x -= 100)
        if (
          document
            .elementFromPoint(x, y)
            ?.classList.contains("react-flow__pane")
        )
          return { x, y };
    throw new Error("没有空白画布位置");
  });
  await page.mouse.click(blank.x, blank.y);
  await expect(
    page.locator('.react-flow__edge[data-id="norm-kv"]'),
  ).not.toHaveClass(/selected/);

  // 只按真实可命中的线身；不先选线，也不借测试代码调用事件处理器。
  const segment = await page
    .locator('.react-flow__edge[data-id="norm-kv"] .react-flow__edge-path')
    .evaluate((element) => {
      const path = element as SVGPathElement;
      const points = [
        ...path.getAttribute("d")!.matchAll(/([ML])\s*([-\d.]+)\s+([-\d.]+)/g),
      ];
      for (let i = 1; i < points.length; i++) {
        if (points[i][1] !== "L") continue;
        const a = new DOMPoint(
          +points[i - 1][2],
          +points[i - 1][3],
        ).matrixTransform(path.getScreenCTM()!);
        const b = new DOMPoint(+points[i][2], +points[i][3]).matrixTransform(
          path.getScreenCTM()!,
        );
        const x = (a.x + b.x) / 2,
          y = (a.y + b.y) / 2;
        if (
          Math.hypot(b.x - a.x, b.y - a.y) > 70 &&
          y > 260 &&
          y < innerHeight - 100 &&
          x > 30 &&
          x < innerWidth - 30 &&
          document
            .elementFromPoint(x, y)
            ?.closest(".react-flow__edge")
            ?.getAttribute("data-id") === "norm-kv"
        )
          return { x, y, horizontal: Math.abs(a.y - b.y) < 1 };
      }
      throw new Error("没有命中真实线身的可拖线段");
    });
  const wire = page.locator(
    '.react-flow__edge[data-id="norm-kv"] .react-flow__edge-path',
  );
  const pathBefore = await wire.getAttribute("d");
  await page.mouse.move(segment.x, segment.y);
  await page.mouse.down();
  await page.mouse.move(
    segment.x + (segment.horizontal ? 0 : 35),
    segment.y + (segment.horizontal ? 35 : 0),
    { steps: 8 },
  );
  await page.mouse.up();
  await expect.poll(() => wire.getAttribute("d")).not.toBe(pathBefore);
  const pathMoved = await wire.getAttribute("d");
  await focus.focus();
  await page.keyboard.press("Control+z");
  await expect.poll(() => wire.getAttribute("d")).toBe(pathBefore);
  // 仅聚焦标签输入框再离开，不应生成空历史或清掉刚才的重做。
  const labelField = page.getByPlaceholder("例如 Q_{3,1}");
  await labelField.focus();
  await labelField.blur();
  await page.keyboard.press("Control+y");
  await expect.poll(() => wire.getAttribute("d")).toBe(pathMoved);
  await page.getByRole("button", { name: "保存到本机", exact: true }).click();
  const saved = await page.evaluate(() =>
    JSON.parse(
      localStorage.getItem(
        "model-atlas:deepseek-v41-layer-layout:v12:prefill:1",
      )!,
    ),
  );
  expect(
    saved.edges.find((e: { id: string }) => e.id === "norm-kv").data,
  ).toMatchObject({
    terminalLabelPosition: expect.any(Number),
    waypoints: expect.any(Array),
  });
  await page.screenshot({ path: "artifacts/editing-wire-label.png" });
  await page.reload();
  await focus.selectOption("kv");
  await expect
    .poll(async () => samePath(await wire.getAttribute("d"), pathMoved))
    .toBe(true);
});

test("Query 标题保持单行，子框内容与父框均无溢出", async ({ page }) => {
  await page.setViewportSize({ width: 2000, height: 1600 });
  await page.goto("/#model=v41&chapter=layer");
  const focus = page.getByRole("combobox", { name: "定位模块" });
  for (const layer of [1, 3, 15, 40]) {
    await page
      .getByRole("button", { name: String(layer), exact: true })
      .click();
    for (const phase of ["Prefill · 整段矩阵", "Decode · 单步一行"]) {
      await page.getByRole("button", { name: phase, exact: true }).click();
      for (const id of ["q", "q-head-slice"]) {
        await focus.selectOption(id === "q-head-slice" ? "q-row" : id);
        const nodes =
          id === "q"
            ? ["q-wdown", "q-wup", "q-low-rank-up", "q-wide-matrix"]
            : ["q-head-1", "q-head-2", "q-head-64"];
        for (const nodeId of nodes) {
          const node = page.locator(`.react-flow__node[data-id="${nodeId}"]`);
          await expect(node.locator("[data-module-title]")).toBeVisible();
          const failures = await node.evaluate((el) => {
            const issues: string[] = [],
              frame = el.getBoundingClientRect();
            for (const item of el.querySelectorAll<HTMLElement>(
              "[data-module-title], [data-structure-content]",
            )) {
              const r = item.getBoundingClientRect();
              if (
                r.bottom > frame.bottom + 1 ||
                r.right > frame.right + 1 ||
                item.scrollHeight > item.clientHeight + 1 ||
                item.scrollWidth > item.clientWidth + 1
              )
                issues.push(
                  `内容越界 ${item.hasAttribute("data-module-title") ? "标题" : "结构"}: ${JSON.stringify(
                    {
                      right: r.right - frame.right,
                      bottom: r.bottom - frame.bottom,
                      scrollWidth: item.scrollWidth,
                      clientWidth: item.clientWidth,
                      scrollHeight: item.scrollHeight,
                      clientHeight: item.clientHeight,
                    },
                  )}`,
                );
              if (item.hasAttribute("data-module-title")) {
                const style = getComputedStyle(item);
                if (
                  item.clientHeight -
                    parseFloat(style.paddingTop) -
                    parseFloat(style.paddingBottom) >
                  parseFloat(style.lineHeight) + 1
                )
                  issues.push("标题换行");
              }
            }
            return issues;
          });
          expect(failures, `${layer}/${phase}/${nodeId}`).toEqual([]);
        }
        if (layer === 3 && phase.startsWith("Prefill"))
          await page
            .locator(`.react-flow__node[data-id="${id}"]`)
            .screenshot({ path: `artifacts/repaired-${id}.png` });
      }
    }
  }
  // 人工收窄导致合法换行时，公式与父分组必须随实测高度一起调整。
  const head = page.locator('.react-flow__node[data-id="q-head-64"]');
  const original = (await head.boundingBox())!;
  await page.mouse.move(original.x + original.width - 1, original.y + 1);
  await page.mouse.down();
  await page.mouse.move(original.x + original.width - 71, original.y + 1, {
    steps: 8,
  });
  await page.mouse.up();
  await expect
    .poll(async () => (await head.boundingBox())!.width)
    .toBeLessThan(original.width - 30);
  await expect
    .poll(() =>
      head.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const parent = document
          .querySelector('.react-flow__node[data-id="q-head-slice"]')!
          .getBoundingClientRect();
        return (
          [
            ...el.querySelectorAll<HTMLElement>(
              "[data-module-title], [data-structure-content]",
            ),
          ].every(
            (child) => child.getBoundingClientRect().bottom <= r.bottom + 1,
          ) && r.bottom <= parent.bottom - 5
        );
      }),
    )
    .toBe(true);
  await page.keyboard.press("Control+z");
  await expect
    .poll(async () =>
      Math.abs((await head.boundingBox())!.width - original.width),
    )
    .toBeLessThan(1);
});
