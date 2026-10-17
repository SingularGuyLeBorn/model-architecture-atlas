import { test, expect, type Locator } from "@playwright/test";

test("身份色跨生成、别名、选择、拼接和 Attention 保持；状态不换身份", async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 3200, height: 2600 });
  await page.goto("/#model=v41&chapter=layer");
  await page.getByRole("button", { name: "收起左栏", exact: true }).click();
  const focus = page.getByRole("combobox", { name: "定位模块" });
  const fill = (el: Locator) =>
    el.first().evaluate((e) => getComputedStyle(e).backgroundColor);
  const ocean = "rgb(197, 226, 252)",
    green = "rgb(220, 238, 227)";
  const screenshot = async (id: string, layer: number, phase: string) => {
    const node = page.locator(`.react-flow__node[data-id="${id}"]`);
    await page.evaluate(() => document.fonts.ready);
    let last = "",
      stable = 0;
    await expect
      .poll(async () => {
        const next = JSON.stringify(await node.boundingBox());
        stable = next === last ? stable + 1 : 0;
        last = next;
        return stable;
      })
      .toBeGreaterThanOrEqual(2);
    const box = (await node.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(3200);
    expect(box.y + box.height).toBeLessThanOrEqual(2600);
    await page.screenshot({
      path: `artifacts/identity-${layer}-${phase}-${id}.png`,
      clip: box,
    });
  };
  for (const [layer, phase] of [
    [3, "Decode"],
    [4, "Decode"],
    [29, "Prefill"],
    [1, "Decode"],
  ] as const) {
    await page
      .getByRole("button", { name: String(layer), exact: true })
      .click();
    await page
      .getByRole("button", {
        name: `${phase} · ${phase === "Decode" ? "单步一行" : "整段矩阵"}`,
        exact: true,
      })
      .click();
    if (phase === "Decode") {
      await focus.selectOption("swa-window");
      const window = page.locator("[data-window-new-kv]");
      await expect(window).toBeVisible();
      const newCell = window.locator('[style*="var(--row-fill)"]').first();
      expect(await fill(newCell)).toBe(green);
      const states = await page
        .locator('[data-window-state="new"], [data-window-state="keep"]')
        .evaluateAll((els) =>
          els.map((e) =>
            getComputedStyle(e).getPropertyValue("--row-fill").trim(),
          ),
        );
      expect(new Set(states)).toEqual(new Set(["#dceee3"]));
      if (layer === 3) await screenshot("swa-window", layer, phase);
    }
    if (layer > 2) {
      await focus.selectOption("compressor");
      if (layer === 3) {
        expect(await fill(page.locator("[data-global-new-input] > div"))).toBe(
          ocean,
        );
        expect(await fill(page.locator("[data-global-kept-rows] > div"))).toBe(
          ocean,
        );
      } else {
        expect(
          await fill(page.locator('[data-cache-reference="G"] > div')),
        ).toBe(ocean);
      }
      await screenshot("compressor", layer, phase);
      await focus.selectOption("global-select");
      const rows = page.locator(
        "[data-selected-global-rows] [data-vector-elements]",
      );
      expect(
        await rows.evaluateAll((els) => [
          ...new Set(els.map((e) => e.getAttribute("data-tone"))),
        ]),
      ).toEqual(["ocean"]);
      const selected = rows.locator("[data-vector-cell]");
      await expect(selected.first()).toBeVisible();
      const chosen = page.locator(
        "[data-selected-global-rows] [data-vector-selected] [data-vector-cell]",
      );
      const ordinary = page.locator(
        "[data-selected-global-rows] [data-vector-elements]:not([data-vector-selected]) [data-vector-cell]",
      );
      expect(await fill(ordinary)).toBe(ocean);
      expect(await fill(chosen)).not.toBe(ocean);
      await screenshot("global-select", layer, phase);
      await focus.selectOption("kv-merge");
      for (const side of ["input", "output"]) {
        expect(
          await fill(
            page.locator(
              `[data-concat-rows="global-${side}"] [data-concat-element]`,
            ),
          ),
        ).toBe(ocean);
        expect(
          await fill(
            page.locator(
              `[data-concat-rows="local-${side}"] [data-concat-element]`,
            ),
          ),
        ).toBe(green);
      }
      if (layer === 29) await screenshot("kv-merge", layer, phase);
    }
    await focus.selectOption("heads");
    const head = page.locator('[data-head-layout="1"]');
    await expect(head).toBeVisible();
    expect(await fill(head.locator('[data-kv-row-tone="green"] > span'))).toBe(
      green,
    );
    if (layer > 2)
      expect(
        await fill(head.locator('[data-kv-row-tone="ocean"] > span')),
      ).toBe(ocean);
    else
      await expect(head.locator('[data-kv-row-tone="ocean"]')).toHaveCount(0);
    expect(
      await fill(
        head
          .locator("[data-attention-value-sum] [data-attention-tensor]")
          .last()
          .locator('span[style*="background"]'),
      ),
    ).toBe(layer > 2 ? ocean : green);
    if (layer === 3) await screenshot("heads", layer, phase);
  }
});
