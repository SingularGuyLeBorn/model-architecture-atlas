import { test, expect } from "@playwright/test";

test("KV 拼接过程、来源、内部端口和下游间距", async ({ page }) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 2600, height: 2200 });
  await page.goto("/#model=v41&chapter=layer");
  await page.getByRole("button", { name: "收起左栏", exact: true }).click();
  for (const [layer, phase, kvSource, indexSource] of [
    [3, "Prefill", 3, 3],
    [4, "Decode", 3, 3],
    [29, "Prefill", 21, 29],
    [1, "Decode", null, null],
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
    let selectedFill = "";
    if (kvSource !== null) {
      await focus.selectOption("global-select");
      const selectedCell = page
        .locator(
          '[data-selected-global-rows] [data-vector-selected="true"] [data-vector-cell]',
        )
        .first();
      await expect(selectedCell).toBeVisible();
      selectedFill = await selectedCell.evaluate(
        (el) => getComputedStyle(el).backgroundColor,
      );
    }
    await focus.selectOption("kv-merge");
    const node = page.locator('.react-flow__node[data-id="kv-merge"]');
    await expect(node.locator(".katex-error")).toHaveCount(0);
    if (kvSource === null) {
      await expect(node.locator("[data-swa-only-kv]")).toHaveCount(1);
      await expect(node.locator('[data-handleid="global"]')).toHaveCount(0);
      continue;
    }
    await expect(node.locator("[data-concat-row]")).toHaveCount(12);
    await expect(node.locator("[data-concat-element]")).toHaveCount(36);
    const fills = await node
      .locator("[data-concat-rows]")
      .evaluateAll((regions) =>
        Object.fromEntries(
          regions.map((region) => [
            region.getAttribute("data-concat-rows"),
            getComputedStyle(region.querySelector("[data-concat-element]")!)
              .backgroundColor,
          ]),
        ),
      );
    expect(fills["local-input"]).toBe(fills["local-output"]);
    expect(fills["global-input"]).toBe(fills["global-output"]);
    expect(fills["local-input"]).not.toBe(fills["global-input"]);
    // 取行恢复常态填充，保持同一海蓝身份；选区加深不作为新身份。
    expect(fills["global-input"]).not.toBe(selectedFill);
    expect(fills["global-input"]).toBe("rgb(197, 226, 252)");
    const tex = await node
      .locator("[aria-label]")
      .evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
    // 图内使用已定义的本层别名；来源由入口与语义属性独立追踪。
    expect(tex).toContain(`G_{${layer},t}^{\\mathrm{selected}}`);
    expect(tex).toContain(`K_{${layer},t}\\times512`);
    await expect(node.locator("[data-kv-row-concat]")).toHaveAttribute(
      "data-kv-source",
      String(kvSource),
    );
    await expect(node.locator("[data-kv-row-concat]")).toHaveAttribute(
      "data-id-source",
      String(indexSource),
    );
    const overflow = await node
      .locator(
        "[data-kv-row-concat], [data-concat-local], [data-concat-global], [data-concat-output], [data-concat-row]",
      )
      .evaluateAll((regions) =>
        regions.flatMap((region) => {
          const b = region.getBoundingClientRect();
          return [...region.querySelectorAll("[aria-label]")]
            .filter((el) => {
              const r = el.getBoundingClientRect();
              return (
                r.left < b.left - 1 ||
                r.right > b.right + 1 ||
                r.top < b.top - 1 ||
                r.bottom > b.bottom + 1
              );
            })
            .map((el) => el.getAttribute("aria-label"));
        }),
      );
    expect(overflow).toEqual([]);
    for (const [region, id] of [
      ["local", "local"],
      ["global", "global"],
      ["output", "kv"],
    ])
      await expect(
        node.locator(`[data-concat-${region}] [data-handleid="${id}"]`),
      ).toHaveCount(1);
    await expect
      .poll(async () => {
        const a = (await node.boundingBox())!;
        const b = (await page
          .locator('.react-flow__node[data-id="heads"]')
          .boundingBox())!;
        return b.y - (a.y + a.height);
      })
      .toBeGreaterThan(20);
    const b = (await node.boundingBox())!;
    await page.mouse.move(1300, 1100);
    await page.mouse.down({ button: "middle" });
    await page.mouse.move(2600 - b.x - b.width / 2, 2200 - b.y - b.height / 2, {
      steps: 5,
    });
    await page.mouse.up({ button: "middle" });
    await expect(node).toBeInViewport({ ratio: 0.999 });
    await page.screenshot({
      path: `artifacts/kv-concat-${layer}-${phase}.png`,
      clip: (await node.boundingBox())!,
    });
  }
  expect(errors).toEqual([]);
});
