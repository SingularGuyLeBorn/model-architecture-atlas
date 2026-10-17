import { test, expect } from "@playwright/test";

test("Engram 双表横排，选中行使用不同填充色，反量化接入结果矩阵", async ({
  page,
}) => {
  await page.goto("/?revision=inspector-prose#model=v41&chapter=layer");
  await page.getByRole("button", { name: "收起左栏", exact: true }).click();
  for (const [layer, phase, width] of [
    [2, "Decode", 2200],
    [15, "Prefill", 900],
  ] as const) {
    await page.setViewportSize({ width, height: 1800 });
    await page
      .getByRole("button", { name: String(layer), exact: true })
      .click();
    await page
      .getByRole("button", {
        name: phase === "Decode" ? "Decode · 单步一行" : "Prefill · 整段矩阵",
        exact: true,
      })
      .click();
    await page
      .getByRole("combobox", { name: "定位模块" })
      .selectOption("engram-lookup");
    const layout = page.locator("[data-engram-read-layout]");
    await expect(
      page.locator("[data-engram-address-link=result]"),
    ).toHaveAttribute("d", /^M/);
    const metrics = await layout.evaluate((root) => {
      const table = root.querySelector("[data-engram-table]")!;
      const result = root.querySelector("[data-engram-scale-table]")!;
      const a = table.getBoundingClientRect(),
        b = result.getBoundingClientRect();
      const cells = [...table.querySelectorAll("[data-vector-cell]")];
      const connections = [
        ...root
          .closest("[data-engram-address-flow]")!
          .querySelectorAll<SVGPathElement>(
            "[data-engram-address-link=result]",
          ),
      ].map((path) => {
        const source = root
          .querySelector("[data-dequant-output] [data-expanded-tensor]")!
          .getBoundingClientRect();
        const start = path
          .getPointAtLength(0)
          .matrixTransform(path.getScreenCTM()!);
        const target = root
          .querySelector(
            "[data-engram-read-result] [data-vector-elements]:last-child [data-vector-cell]:last-child",
          )!
          .getBoundingClientRect();
        // 开放箭翼是独立 path；数据线末端必须落在实际输出元素上。
        const end = path
          .getPointAtLength(path.getTotalLength())
          .matrixTransform(path.getScreenCTM()!);
        return {
          sourceGap: Math.hypot(
            start.x - source.right,
            start.y - source.top - source.height / 2,
          ),
          targetGap: Math.hypot(
            end.x - target.left - target.width / 2,
            end.y - target.bottom,
          ),
        };
      });
      return {
        connections,
        sideBySide: b.left > a.right && b.top < a.bottom,
        selectedColors: [
          ...new Set(
            cells
              .filter((c) => c.closest("[data-vector-selected]"))
              .map((c) => getComputedStyle(c).backgroundColor),
          ),
        ],
        unselectedColors: [
          ...new Set(
            cells
              .filter((c) => !c.closest("[data-vector-selected]"))
              .map((c) => getComputedStyle(c).backgroundColor),
          ),
        ],
        widthRange:
          Math.max(...cells.map((c) => c.getBoundingClientRect().width)) -
          Math.min(...cells.map((c) => c.getBoundingClientRect().width)),
        overflow: [...root.querySelectorAll<HTMLElement>("div")].filter(
          (el) => el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 2,
        ).length,
      };
    });
    expect(metrics.sideBySide).toBe(true);
    expect(metrics.connections).toHaveLength(1);
    for (const connection of metrics.connections) {
      expect(connection.sourceGap).toBeLessThan(2);
      expect(connection.targetGap).toBeLessThan(2);
    }
    expect(metrics.selectedColors).toEqual(["rgb(246, 229, 201)"]);
    expect(metrics.unselectedColors).toEqual(["rgb(223, 228, 247)"]);
    expect(metrics.widthRange).toBeLessThan(1);
    expect(metrics.overflow).toBe(0);
    await expect(layout.locator("[data-matrix-ellipsis-column]")).toHaveCount(
      18,
    );
    await expect(layout.locator(".katex-error")).toHaveCount(0);
    await layout.screenshot({
      path: `artifacts/engram-horizontal-${layer}-${phase}.png`,
    });
  }
});

test("各 Full 层分支独立、指数只框变量、展开向量不溢出且导线贴合", async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 2400, height: 2200 });
  await page.goto("/?revision=inspector-prose#model=v41&chapter=layer");
  await page.getByRole("button", { name: "收起左栏", exact: true }).click();
  for (const [layer, phase, width] of [
    [3, "Decode", 2400],
    [9, "Prefill", 2400],
    [15, "Decode", 900],
    [21, "Decode", 900],
  ] as const) {
    await page.setViewportSize({ width, height: 2200 });
    await page
      .getByRole("button", { name: String(layer), exact: true })
      .click();
    await page
      .getByRole("button", {
        name: phase === "Decode" ? "Decode · 单步一行" : "Prefill · 整段矩阵",
        exact: true,
      })
      .click();
    await page
      .getByRole("combobox", { name: "定位模块" })
      .selectOption("compressor");
    const node = page.locator('.react-flow__node[data-id="compressor"]');
    await expect(
      node.locator("[data-compressor-projection] > [data-branch-frame]"),
    ).toHaveCount(layer === 21 ? 1 : 2);
    await expect
      .poll(() =>
        node.evaluate((root) =>
          [...root.querySelectorAll<HTMLElement>("div,section")]
            .filter(
              (el) =>
                el.clientWidth > 0 &&
                el.scrollWidth > el.clientWidth + 2 &&
                !el.querySelector(":scope > .react-flow__handle"),
            )
            .map((el) => el.outerHTML.slice(0, 140)),
        ),
      )
      .toEqual([]);
    await expect(node.locator(".katex-error")).toHaveCount(0);
    const captions = await node.evaluate((root) => {
      const labels = [
        ...root.querySelectorAll(
          "[data-tensor-origin], [data-compressor-output-role], [data-tensor-caption]",
        ),
      ];
      return labels.map((label) => !!label.closest("[data-expanded-tensor]"));
    });
    expect(captions.every((inside) => !inside)).toBe(true);
    await expect(node.locator("[data-projection-scalar-examples]")).toHaveCount(
      0,
    );
    await expect(node.locator("[data-global-append-result] small")).toHaveCount(
      0,
    );
    if (layer !== 21) {
      const measures = await node.evaluate((root) => {
        const dot = root
          .querySelector(
            "[data-compressor-gate-columns] [data-structure-ellipsis]",
          )!
          .getBoundingClientRect();
        const first = root
          .querySelector("[data-compressor-gate-column]")!
          .getBoundingClientRect();
        const boxes = [
          ...root.querySelectorAll("menclose[notation='box']"),
        ].map((el) => getComputedStyle(el).borderTopWidth);
        const widths = [
          ...root.querySelectorAll(
            "[data-compressor-weight-role], [data-compressor-content-role]",
          ),
        ].map((v) => {
          const cells = [...v.querySelectorAll("[data-vector-cell]")].map(
            (el) => el.getBoundingClientRect().width,
          );
          return Math.max(...cells) - Math.min(...cells);
        });
        const paths = [
          ...root.querySelectorAll<SVGPathElement>(
            "[data-sum-junction='2'] [data-sum-input]",
          ),
        ];
        const products = [
          ...root.querySelectorAll("[data-compressor-product]"),
        ];
        const gaps = paths.map((p, i) => {
          const start = p
            .getPointAtLength(0)
            .matrixTransform(p.getScreenCTM()!);
          const r = products[i].getBoundingClientRect();
          return Math.hypot(start.x - r.left - r.width / 2, start.y - r.bottom);
        });
        return {
          equationsAligned: [
            ...root.querySelectorAll("[data-compressor-normalized-weight]"),
          ].every((row) => {
            const left = row.firstElementChild!.getBoundingClientRect();
            const right = row.lastElementChild!.getBoundingClientRect();
            return (
              right.left > left.right &&
              Math.abs(
                left.top + left.height / 2 - right.top - right.height / 2,
              ) < 1
            );
          }),
          dotGap: Math.abs(
            dot.top + dot.height / 2 - first.top - first.height / 2,
          ),
          boxes,
          widths,
          gaps,
        };
      });
      expect(measures.dotGap).toBeLessThan(1);
      expect(measures.equationsAligned).toBe(true);
      expect(measures.boxes.length).toBe(18);
      expect(measures.boxes.every((w) => parseFloat(w) > 0)).toBe(true);
      expect(measures.widths.every((w) => w < 1)).toBe(true);
      expect(measures.gaps.every((g) => g < 2)).toBe(true);
    }
    await node.screenshot({
      path: `artifacts/compressor-structure-${layer}-${phase}.png`,
    });
    if (layer === 3) {
      const variable = node.locator("menclose[notation='box']").first();
      await variable.click();
      await expect(variable).toHaveAttribute("data-internal-selected", "true");
      await expect(page.locator("[data-internal-explanation]")).toContainText(
        "输入变量",
      );
      await page.getByRole("button", { name: "关闭模块解释" }).click();
    }
  }
  expect(errors).toEqual([]);
});

test("Indexer 的省略号位于分支中部，Attention 指数框不包住底数 e", async ({
  page,
}) => {
  await page.setViewportSize({ width: 2200, height: 1800 });
  await page.goto("/?revision=inspector-prose#model=v41&chapter=layer");
  await page.getByRole("button", { name: "25", exact: true }).click();
  await page
    .getByRole("button", { name: "Decode · 单步一行", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "定位模块" })
    .selectOption("indexer");
  const score = page.locator("[data-index-score-columns]");
  await expect(score).toBeAttached();
  expect(
    await score.evaluate((root) => {
      const a = root
        .querySelector("[data-structure-ellipsis]")!
        .getBoundingClientRect();
      const b = root.getBoundingClientRect();
      return Math.abs(a.top + a.height / 2 - b.top - b.height / 2);
    }),
  ).toBeLessThan(1);
  await page.getByRole("combobox", { name: "定位模块" }).selectOption("heads");
  await expect(
    page.locator("[data-attention-denominator] msup menclose"),
  ).toHaveCount(12);
  await expect(page.locator(".katex-error")).toHaveCount(0);
});
