import { test, expect } from "@playwright/test";

test("压缩 KV 均方根横排，分区换行后连接仍贴合且无溢出", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.setViewportSize({ width: 2200, height: 1700 });
  await page.goto("/#model=v41&chapter=layer");
  await page.getByRole("button", { name: "收起左栏", exact: true }).click();
  for (const [layer, phase, width] of [
    [3, "Prefill", 2200],
    [15, "Prefill", 2200],
    [21, "Prefill", 2200],
    [21, "Decode", 900],
    [3, "Decode", 900],
  ] as const) {
    await page.setViewportSize({ width, height: 1700 });
    await page
      .getByRole("button", { name: String(layer), exact: true })
      .click();
    await page
      .getByRole("button", {
        name: phase === "Prefill" ? "Prefill · 整段矩阵" : "Decode · 单步一行",
        exact: true,
      })
      .click();
    await page
      .getByRole("combobox", { name: "定位模块" })
      .selectOption("compressor");
    const norm = page.locator('[data-rmsnorm="压缩 KV"]');
    await expect(norm).toBeAttached();
    const bounds = (await norm.boundingBox())!;
    await page.mouse.move(width / 2, 850);
    await page.mouse.down({ button: "middle" });
    await page.mouse.move(
      width - bounds.x - bounds.width / 2,
      1700 - bounds.y - bounds.height / 2,
      { steps: 5 },
    );
    await page.mouse.up({ button: "middle" });
    await expect(
      norm.locator('[data-rmsnorm-root-flow="horizontal"]'),
    ).toBeVisible();
    const result = await norm.evaluate((root) => {
      const flow = root.querySelector<HTMLElement>("[data-rmsnorm-root-flow]")!;
      const parts = [
        "[data-rmsnorm-input]",
        "[data-rmsnorm-square]",
        "[data-rmsnorm-reduction]",
        "[data-rmsnorm-root-result]",
      ].map((selector) =>
        flow.querySelector(selector)!.getBoundingClientRect(),
      );
      const overflow = [...root.querySelectorAll<HTMLElement>("div")]
        .filter(
          (el) =>
            el.clientWidth > 0 &&
            el.scrollWidth > el.clientWidth + 2 &&
            // 端口命中区允许伸出矩阵边缘；内部矩阵仍逐一检查。
            !el.querySelector(":scope > .react-flow__handle"),
        )
        .map((el) => ({
          text: el.textContent?.slice(0, 40),
          tag: el.outerHTML.slice(0, 200),
          width: el.clientWidth,
          content: el.scrollWidth,
        }));
      const source = root
        .querySelector("[data-rmsnorm-root-result]")!
        .getBoundingClientRect();
      const target = root
        .querySelector("[data-rmsnorm-broadcast]")!
        .getBoundingClientRect();
      const path = root.querySelector<SVGPathElement>(
        "[data-rmsnorm-transfer] path",
      )!;
      const first = path
        .getPointAtLength(0)
        .matrixTransform(path.getScreenCTM()!);
      const last = path
        .getPointAtLength(path.getTotalLength())
        .matrixTransform(path.getScreenCTM()!);
      const stacked =
        root
          .querySelector('[data-rmsnorm-stage="scale"]')!
          .getBoundingClientRect().top >=
        root
          .querySelector('[data-rmsnorm-stage="root"]')!
          .getBoundingClientRect().bottom;
      const scale = root
        .querySelector("[data-rmsnorm-broadcast]")!
        .getBoundingClientRect();
      const output = root
        .querySelector("[data-rmsnorm-row-output]")!
        .getBoundingClientRect();
      return {
        compactHeight: (root as HTMLElement).offsetHeight,
        outputBesideScale:
          output.left > scale.right && output.top < scale.bottom,
        overflow,
        height: flow.offsetHeight,
        ordered: parts.every((p, i) => i === 0 || p.left > parts[i - 1].left),
        sourceGap: Math.hypot(
          first.x - (stacked ? source.left + source.width / 2 : source.right),
          first.y - (stacked ? source.bottom : source.top + source.height / 2),
        ),
        targetGap: Math.hypot(
          last.x - (stacked ? target.left + target.width / 2 : target.left),
          last.y - (stacked ? target.top : target.top + target.height / 2),
        ),
      };
    });
    await page.screenshot({
      path: `artifacts/compressor-rms-horizontal-${layer}-${phase}-${width}.png`,
    });
    expect(result.overflow).toEqual([]);
    expect(result.ordered).toBe(true);
    expect(result.height).toBeLessThan(250);
    expect(result.compactHeight).toBeLessThan(650);
    expect(result.outputBesideScale).toBe(true);
    expect(result.sourceGap).toBeLessThan(2);
    expect(result.targetGap).toBeLessThan(2);
    await expect(norm.locator("[data-sum-input]")).toHaveCount(3);
    await expect(norm.locator(".katex-error")).toHaveCount(0);
    expect(
      (await norm.locator(".katex-html").allTextContents()).join(" "),
    ).not.toContain("longrightarrow");
    const rotary = page.locator(
      '.react-flow__node[data-id="compressor"] [data-rotary-process]',
    );
    await expect
      .poll(() =>
        rotary.evaluate((root) => {
          const bounds = root.getBoundingClientRect();
          return [...root.querySelectorAll("div,span")].filter((el) => {
            if (el.closest(".katex-mathml")) return false;
            const r = el.getBoundingClientRect();
            return (
              r.width > 0 &&
              (r.left < bounds.left - 2 || r.right > bounds.right + 2)
            );
          }).length;
        }),
      )
      .toBe(0);
    if (layer === 3 && phase === "Prefill") {
      await norm.screenshot({
        path: "artifacts/compressor-rms-compact-detail.png",
      });
      await rotary.screenshot({
        path: "artifacts/compressor-rope-compact-detail.png",
      });
    }
  }
  expect(errors).toEqual([]);
});
