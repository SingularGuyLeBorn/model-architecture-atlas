import { test, expect } from "@playwright/test";

test("Reindex 本层分数说明在框外，框按公式定高并接回过滤流程", async ({
  page,
}) => {
  await page.setViewportSize({ width: 2400, height: 4200 });
  await page.goto("/?revision=inspector-prose#model=v41&chapter=layer");
  for (const layer of [25, 29, 33, 37]) {
    await page
      .getByRole("button", { name: String(layer), exact: true })
      .click();
    if (layer === 37) {
      await page.setViewportSize({ width: 1000, height: 4200 });
      await page
        .getByRole("button", { name: "Decode · 单步一行", exact: true })
        .click();
    }
    await page
      .getByRole("combobox", { name: "定位模块" })
      .selectOption("indexer");
    const score = page.locator(
      `[data-candidate-filter="${layer}"] [data-candidate-score]`,
    );
    await expect(score).toBeAttached();
    const measurements = await score.evaluate((el) => {
      const caption = el.querySelector("[data-candidate-score-caption]")!;
      const box = el.lastElementChild!;
      const formula = box.querySelector(".katex")!;
      const c = caption.getBoundingClientRect(),
        b = box.getBoundingClientRect();
      const f = formula.getBoundingClientRect();
      const scale = b.width / (box as HTMLElement).offsetWidth;
      return {
        outside: c.bottom <= b.top,
        text: box.textContent,
        slack: (b.height - f.height) / scale,
        overflow: box.scrollWidth > box.clientWidth + 1,
      };
    });
    expect(measurements.outside).toBe(true);
    expect(measurements.text).not.toContain("本层分数");
    expect(measurements.slack).toBeLessThan(24);
    expect(measurements.overflow).toBe(false);
    await expect(page.locator(".katex-error")).toHaveCount(0);
    // 框只去掉说明与拉伸；两输入汇入及后续 Top-K 保留。
    const filter = page.locator(`[data-candidate-filter="${layer}"]`);
    await expect(filter.locator('[data-merge-arrows="2"]')).toHaveCount(1);
    if (layer === 37) {
      const r = (await filter.boundingBox())!;
      await page.mouse.move(500, 700);
      await page.mouse.wheel(2 * (r.x + r.width / 2 - 500), 0);
    }
    await expect(filter).toBeInViewport({ ratio: 0.999 });
    const clip = (await filter.boundingBox())!;
    await page.screenshot({
      path: `artifacts/candidate-score-caption-${layer}.png`,
      clip,
    });
  }
});
