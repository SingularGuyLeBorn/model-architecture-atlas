import { test, expect } from "@playwright/test";

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
          dotGap: Math.abs(
            dot.top + dot.height / 2 - first.top - first.height / 2,
          ),
          boxes,
          widths,
          gaps,
        };
      });
      expect(measures.dotGap).toBeLessThan(1);
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
