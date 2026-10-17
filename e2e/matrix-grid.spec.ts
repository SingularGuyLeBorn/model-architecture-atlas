import { test, expect } from "@playwright/test";

test("矩阵元素全组同尺寸，纵省略号逐列对齐", async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 2600, height: 2200 });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/#model=v41&chapter=layer");
  await page.getByRole("button", { name: "收起左栏", exact: true }).click();
  for (const [layer, phase, width] of [
    [3, "Prefill", 2600],
    [15, "Prefill", 2600],
    [29, "Decode", 2600],
    [29, "Decode", 900],
  ] as const) {
    await page.setViewportSize({ width, height: 2200 });
    await page
      .getByRole("button", { name: String(layer), exact: true })
      .click();
    await page
      .getByRole("button", {
        name: `${phase} · ${phase === "Prefill" ? "整段矩阵" : "单步一行"}`,
        exact: true,
      })
      .click();
    const focus = page.getByRole("combobox", { name: "定位模块" });
    await focus.selectOption("concat");
    await focus.selectOption("swa-window");
    const matrices = page.locator(
      "[data-uniform-matrix], [data-selected-global-rows]",
    );
    const windowMatrix = page.locator(
      `.react-flow__node[data-id="swa-window"] ${phase === "Decode" ? "[data-selection-window]" : "[data-window-matrix]"}`,
    );
    await expect(windowMatrix).toBeAttached();
    const audit = () =>
      matrices.evaluateAll((roots) =>
        roots.flatMap((root) => {
          const cells = [
            ...root.querySelectorAll<HTMLElement>("[data-vector-cell]"),
          ];
          if (!cells.length) return [];
          const bounds = cells.map((c) => c.getBoundingClientRect());
          const spread = (values: number[]) =>
            Math.max(...values) - Math.min(...values);
          const firstRow = root.querySelector("[data-vector-elements]")!;
          const columnCenters = [
            ...firstRow.querySelectorAll("[data-vector-cell]"),
          ].map((c) => {
            const r = c.getBoundingClientRect();
            return r.x + r.width / 2;
          });
          const ellipsis = [
            ...root.querySelectorAll("[data-matrix-ellipsis-row]"),
          ];
          const validDots = ellipsis.every((row) => {
            const dots = [
              ...row.querySelectorAll("[data-matrix-ellipsis-column]"),
            ];
            return (
              dots.length === columnCenters.length &&
              dots.every((dot, i) => {
                const r = dot.getBoundingClientRect();
                return Math.abs(r.x + r.width / 2 - columnCenters[i]) < 1;
              })
            );
          });
          const bad =
            spread(bounds.map((r) => r.width)) > 1 ||
            spread(bounds.map((r) => r.height)) > 1 ||
            new Set(cells.map((c) => getComputedStyle(c).fontSize)).size !==
              1 ||
            cells.some(
              (c) =>
                c.scrollWidth > c.clientWidth + 1 ||
                c.scrollHeight > c.clientHeight + 1,
            ) ||
            !validDots;
          return bad
            ? [
                {
                  label: root
                    .querySelector("[aria-label]")
                    ?.getAttribute("aria-label"),
                  widths: bounds.map((r) => r.width),
                  heights: bounds.map((r) => r.height),
                  validDots,
                },
              ]
            : [];
        }),
      );
    for (const [name, target] of [
      ["window", windowMatrix],
      ["index-head", page.locator('[data-index-head="32"]')],
    ] as const) {
      await focus.selectOption(name === "window" ? "swa-window" : "indexer");
      await expect(target).toBeAttached();
      await expect.poll(audit).toEqual([]);
      const b = (await target.boundingBox())!;
      await page.mouse.move(width / 2, 1100);
      await page.mouse.down({ button: "middle" });
      await page.mouse.move(
        width - b.x - b.width / 2,
        2200 - b.y - b.height / 2,
        { steps: 5 },
      );
      await page.mouse.up({ button: "middle" });
      await expect(target).toBeInViewport({ ratio: 0.999 });
      await page.screenshot({
        path: `artifacts/matrix-grid-${layer}-${phase}-${name}${width === 900 ? "-narrow" : ""}.png`,
        clip: (await target.boundingBox())!,
      });
    }
  }
  await expect(page.locator(".katex-error")).toHaveCount(0);
  expect(errors).toEqual([]);
});
