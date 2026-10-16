import { test, expect } from "@playwright/test";

test("压缩器投影维度、并行布局及输出连接", async ({ page }) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 2600, height: 3200 });
  await page.goto("/#model=v41&chapter=layer");
  await page.getByRole("button", { name: "收起左栏", exact: true }).click();
  for (const [layer, phase, branches] of [
    [3, "Prefill", 2],
    [15, "Decode", 2],
    [21, "Prefill", 1],
    [21, "Decode", 1],
    [29, "Decode", 0],
    [4, "Prefill", 0],
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
    const focus = page.getByRole("combobox", { name: "定位模块" });
    await focus.selectOption("concat");
    await focus.selectOption("compressor");
    const node = page.locator('.react-flow__node[data-id="compressor"]');
    await expect(node.locator("[data-compressor-projection]")).toHaveCount(
      branches,
    );
    await expect(node.locator(".katex-error")).toHaveCount(0);
    await expect(node.locator("[data-compressor-pooling]")).toHaveCount(
      branches === 2 ? 1 : 0,
    );
    if (branches === 2) {
      await expect(node.locator("[data-compressor-weight-role]")).toHaveCount(
        2,
      );
      await expect(node.locator("[data-compressor-content-role]")).toHaveCount(
        2,
      );
      await expect(node.locator("[data-compressor-gate-column]")).toHaveCount(
        3,
      );
      const formulas = await node
        .locator("[data-compressor-gate-columns] [aria-label]")
        .evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
      for (const d of [1, 2, 512]) {
        expect(formulas).toContain(
          `\\alpha_{${layer},i,1,${d}}+\\alpha_{${layer},i,2,${d}}=1`,
        );
        for (const row of [1, 2])
          expect(formulas).toContain(
            `\\alpha_{${layer},i,${row},${d}}=\\frac{\\exp(a^{\\mathrm{gate}}_{${layer},${row === 1 ? "2i-1" : "2i"},${d}})}{\\exp(a^{\\mathrm{gate}}_{${layer},2i-1,${d}})+\\exp(a^{\\mathrm{gate}}_{${layer},2i,${d}})}`,
          );
      }
    }
    if (!branches) continue;
    await expect
      .poll(() => node.evaluate((el) => el.getBoundingClientRect().height))
      .toBeGreaterThan(300);
    const overflow = await node
      .locator(
        "[data-compressor-projection], [data-projection-input], [data-projection-weight], [data-projection-output], [data-compressor-pooling], [data-compressor-gate-column], [data-compressor-weight-role], [data-compressor-content-role]",
      )
      .evaluateAll((regions) =>
        regions.flatMap((region) => {
          const bounds = region.getBoundingClientRect();
          return [...region.querySelectorAll("[aria-label]")]
            .filter((el) => {
              const b = el.getBoundingClientRect();
              return (
                b.left < bounds.left - 1 ||
                b.right > bounds.right + 1 ||
                b.top < bounds.top - 1 ||
                b.bottom > bounds.bottom + 1
              );
            })
            .map((el) => el.getAttribute("aria-label"));
        }),
      );
    expect(overflow).toEqual([]);
    const rects = await node
      .locator("[data-compressor-projection]")
      .evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, right: r.right };
        }),
      );
    if (branches === 2) {
      expect(Math.abs(rects[0].y - rects[1].y)).toBeLessThan(1);
      expect(rects[1].x - rects[0].right).toBeGreaterThan(5);
    }
    const heights = await node
      .locator("[data-parameter-column]")
      .evaluateAll((els) => els.map((el) => (el as HTMLElement).offsetHeight));
    for (const h of heights) expect(h).toBeLessThan(50);
    for (const [name, target] of [
      ["projections", node.locator("[data-compressor-projections]")],
      ...(branches === 2
        ? ([["pooling", node.locator("[data-compressor-pooling]")]] as const)
        : []),
      ["overview", node],
    ] as const) {
      const b = (await target.boundingBox())!;
      await page.mouse.move(1300, 1600);
      await page.mouse.down({ button: "middle" });
      await page.mouse.move(
        2600 - b.x - b.width / 2,
        3200 - b.y - b.height / 2,
        { steps: 5 },
      );
      await page.mouse.up({ button: "middle" });
      await expect(target).toBeInViewport({ ratio: 0.999 });
      await page.screenshot({
        path: `artifacts/compressor-${layer}-${phase}-${name}.png`,
        clip: (await target.boundingBox())!,
      });
    }
  }
  expect(errors).toEqual([]);
  await page.setViewportSize({ width: 900, height: 1000 });
  await page.getByRole("button", { name: "15", exact: true }).click();
  await page
    .getByRole("combobox", { name: "定位模块" })
    .selectOption("compressor");
  const overflow = await page
    .locator(
      "[data-compressor-projection], [data-compressor-pooling], [data-compressor-gate-column]",
    )
    .evaluateAll((regions) =>
      regions.some((region) => {
        const bounds = region.getBoundingClientRect();
        return [...region.querySelectorAll("[aria-label]")].some((el) => {
          const b = el.getBoundingClientRect();
          return (
            b.left < bounds.left - 1 ||
            b.right > bounds.right + 1 ||
            b.bottom > bounds.bottom + 1
          );
        });
      }),
    );
  expect(overflow).toBe(false);
});
