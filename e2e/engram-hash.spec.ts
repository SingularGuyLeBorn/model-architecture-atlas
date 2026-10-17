import { expect, test } from "@playwright/test";

test("两层 Engram 哈希：乘积接入异或，同一 u 连到各头地址计算", async ({
  page,
}) => {
  await page.goto("/?revision=engram-hash#model=v41&chapter=layer");
  await page.getByRole("button", { name: "收起左栏", exact: true }).click();
  for (const [layer, phase, width] of [
    [2, "Prefill", 2200],
    [2, "Decode", 900],
    [15, "Prefill", 900],
    [15, "Decode", 2200],
  ] as const) {
    await page.setViewportSize({ width, height: 1600 });
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
    const hash = page.locator("[data-engram-hash]");
    await expect(hash.locator("[data-hash-link]")).toHaveCount(21);
    const result = await hash.evaluate((root) => {
      const errors: string[] = [];
      for (const card of root.querySelectorAll<HTMLElement>("[data-ngram]")) {
        const n = Number(card.dataset.ngram);
        if (card.querySelectorAll("[data-hash-product]").length !== n)
          errors.push("缺乘积");
        for (const path of card.querySelectorAll<SVGPathElement>(
          "[data-hash-link]",
        )) {
          const source = card.querySelector<HTMLElement>(
            `[data-hash-port="${path.dataset.from}"]`,
          )!;
          const target = card.querySelector<HTMLElement>(
            `[data-hash-port="${path.dataset.to}"]`,
          )!;
          const matrix = path.getScreenCTM()!;
          const scale = Math.hypot(matrix.a, matrix.b);
          const start = path.getPointAtLength(0).matrixTransform(matrix);
          const end = path
            .getPointAtLength(path.getTotalLength())
            .matrixTransform(matrix);
          const edgeGap = (p: DOMPoint, el: HTMLElement) => {
            const r = el.getBoundingClientRect();
            return (
              Math.min(
                Math.hypot(
                  p.x - Math.max(r.left, Math.min(p.x, r.right)),
                  p.y - r.top,
                ),
                Math.hypot(
                  p.x - Math.max(r.left, Math.min(p.x, r.right)),
                  p.y - r.bottom,
                ),
                Math.hypot(
                  p.x - r.left,
                  p.y - Math.max(r.top, Math.min(p.y, r.bottom)),
                ),
                Math.hypot(
                  p.x - r.right,
                  p.y - Math.max(r.top, Math.min(p.y, r.bottom)),
                ),
              ) / scale
            );
          };
          if (edgeGap(start, source) > 1 || edgeGap(end, target) > 1)
            errors.push(`断线 ${n} ${path.dataset.from}→${path.dataset.to}`);
          const others = [
            ...card.querySelectorAll<HTMLElement>("[data-hash-port]"),
          ].filter((el) => el !== source && el !== target);
          for (let d = 3; d < path.getTotalLength() - 3; d += 3) {
            const p = path.getPointAtLength(d).matrixTransform(matrix);
            if (
              others.some((el) => {
                const r = el.getBoundingClientRect();
                return (
                  p.x > r.left + scale &&
                  p.x < r.right - scale &&
                  p.y > r.top + scale &&
                  p.y < r.bottom - scale
                );
              })
            ) {
              errors.push(
                `穿过其他对象 ${n} ${path.dataset.from}→${path.dataset.to}`,
              );
              break;
            }
          }
        }
        for (const el of card.querySelectorAll<HTMLElement>("div"))
          if (el.clientWidth && el.scrollWidth > el.clientWidth + 2)
            errors.push(
              `溢出 ${n}: ${el.clientWidth}/${el.scrollWidth} ${el.outerHTML.slice(0, 250)}`,
            );
      }
      const cards = [...root.querySelectorAll("[data-ngram]")].map((el) =>
        el.getBoundingClientRect(),
      );
      return {
        errors,
        parallel: cards.every((r) => Math.abs(r.top - cards[0].top) < 2),
      };
    });
    expect(result.errors).toEqual([]);
    expect(result.parallel).toBe(true);
    await expect(hash.locator(".katex-error")).toHaveCount(0);
    // 内部布局在定位模块的阅读倍率下验收；窄画布用现有缩放控件截取完整三支。
    if (width === 900) {
      await page.locator(".react-flow__controls-zoomout").click();
      await page.locator(".react-flow__controls-zoomout").click();
      await page.locator(".react-flow__controls-zoomout").click();
      await expect
        .poll(async () => {
          const r = await hash.boundingBox();
          return (
            !!r &&
            r.x >= 0 &&
            r.x + r.width <= width &&
            r.y >= 0 &&
            r.y + r.height <= 1600
          );
        })
        .toBe(true);
    }
    await hash.screenshot({
      path: `artifacts/engram-hash-${layer}-${phase}.png`,
    });
    if (layer === 2 && phase === "Prefill") {
      await page.setViewportSize({ width: 4000, height: 3400 });
      await page
        .getByRole("combobox", { name: "定位模块" })
        .selectOption("engram-lookup");
      await page
        .locator("[data-engram-lookup]")
        .screenshot({ path: "artifacts/engram-hash-full.png" });
    }
  }
});
