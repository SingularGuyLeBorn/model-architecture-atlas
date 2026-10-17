import { test, expect, type Locator } from "@playwright/test";
import { COLORS, selectionPalette } from "../src/components/diagram-primitives";

test("二十色用于真实数据，压缩与反量化沿来源保持颜色", async ({
  page,
}, testInfo) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 3600, height: 3000 });
  await page.goto("/#model=v41&chapter=layer");
  await page.getByRole("button", { name: "收起左栏", exact: true }).click();
  const palette = Object.fromEntries(
    Object.entries(COLORS)
      .filter(([key]) => key.endsWith("Soft"))
      .map(([key, hex]) => [
        key.slice(0, -4),
        `rgb(${[1, 3, 5].map((n) => parseInt(hex.slice(n, n + 2), 16)).join(", ")})`,
      ]),
  );
  const used = new Set<string>();
  const byModule: Record<string, string[]> = {};
  const fill = (locator: Locator) =>
    locator.first().evaluate((el) => getComputedStyle(el).backgroundColor);
  const focus = page.getByRole("combobox", { name: "定位模块" });
  for (const [layer, phase, id] of [
    [3, "Prefill", "compressor"],
    [3, "Decode", "compressor"],
    [21, "Decode", "compressor"],
    [3, "Prefill", "hc-mix-a"],
    [3, "Prefill", "add1"],
    [3, "Prefill", "heads"],
    [2, "Prefill", "engram-lookup"],
    [29, "Prefill", "kv-merge"],
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
    await focus.selectOption(id);
    const node = page.locator(`.react-flow__node[data-id="${id}"]`);
    await expect(node).toBeVisible();
    await expect(
      node.locator("[data-detail-suspended], .katex-error"),
    ).toHaveCount(0);
    const fills = await node.evaluate((root) => {
      const values = new Set<string>();
      for (const formula of root.querySelectorAll<HTMLElement>(
        "[aria-label]",
      )) {
        if (formula.closest("[data-mhc-affine-legend]")) continue;
        let current: HTMLElement | null = formula;
        while (current && current !== root) {
          const color = getComputedStyle(current).backgroundColor;
          if (color !== "rgba(0, 0, 0, 0)" && color !== "transparent") {
            values.add(color);
            break;
          }
          current = current.parentElement;
        }
      }
      return [...values];
    });
    const roles = Object.entries(palette)
      .filter(([, color]) => fills.includes(color))
      .map(([tone]) => tone);
    roles.forEach((tone) => used.add(tone));
    byModule[`${layer}-${phase}-${id}`] = roles;
    if (id === "compressor") {
      expect(
        await fill(
          node.locator(
            '[data-compressor-projection="kv"] [data-projection-output] [data-vector-cell]',
          ),
        ),
      ).toBe(palette.forest);
      const globalOutput = node.locator(
        '[data-rmsnorm="压缩 KV"] [data-rmsnorm-row-output] [data-vector-cell]',
      );
      expect(await fill(globalOutput)).toBe(palette.ocean);
      if (phase === "Prefill")
        expect(
          await fill(
            node.locator(
              '[data-rmsnorm="压缩 KV"] [data-rmsnorm-output] [data-vector-cell]',
            ),
          ),
        ).toBe(palette.ocean);
      const input = node.locator(
        '[data-rmsnorm="压缩 KV"] [data-rmsnorm-stage="root"] [data-vector-cell]',
      );
      expect(await fill(input)).toBe(
        layer === 21 ? palette.forest : palette.coral,
      );
      expect(
        await fill(node.locator("[data-rmsnorm-gamma] [data-vector-cell]")),
      ).toBe(palette.crimson);
      if (layer === 3) {
        expect(
          await fill(
            node.locator(
              '[data-compressor-projection="gate"] [data-parameter-column]',
            ),
          ),
        ).toBe(palette.lavender);
        expect(
          await fill(
            node.locator("[data-compressor-content-role] [data-vector-cell]"),
          ),
        ).toBe(palette.forest);
        expect(
          await fill(
            node.locator("[data-compressor-weight-role] [data-vector-cell]"),
          ),
        ).toBe(palette.gold);
        expect(
          await fill(
            node.locator(
              '[data-compressor-normalized-weight] [data-expanded-tensor], [data-compressor-normalized-weight] div[style*="background"]',
            ),
          ),
        ).toBe(palette.gold);
        expect(
          await fill(
            node.locator("[data-compressor-product] [data-vector-cell]"),
          ),
        ).toBe(palette.teal);
        expect(
          await fill(
            node.locator("[data-compressor-pool-result] [data-vector-cell]"),
          ),
        ).toBe(palette.coral);
      }
    }
    if (id === "engram-lookup") {
      expect(
        await fill(
          node.locator(
            '[data-engram-scale-table] [data-vector-selected="true"] [data-vector-cell]',
          ),
        ),
      ).toBe(
        await page.evaluate((hex) => {
          const e = document.createElement("span");
          e.style.background = hex;
          document.body.append(e);
          const value = getComputedStyle(e).backgroundColor;
          e.remove();
          return value;
        }, selectionPalette("ochre", "amber").background),
      );
      expect(
        await fill(node.locator("[data-dequant-scales] [data-vector-cell]")),
      ).toBe(palette.ochre);
    }
    if (["compressor", "hc-mix-a", "engram-lookup"].includes(id)) {
      await page.evaluate(() => document.fonts.ready);
      let previous = "",
        stable = 0;
      await expect
        .poll(async () => {
          const key = JSON.stringify(await node.boundingBox());
          stable = key === previous ? stable + 1 : 0;
          previous = key;
          return stable;
        })
        .toBeGreaterThanOrEqual(2);
      const rect = (await node.boundingBox())!;
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(3600);
      expect(rect.y + rect.height).toBeLessThanOrEqual(3000);
      await page.screenshot({
        path: `artifacts/palette-${layer}-${phase}-${id}.png`,
        clip: rect,
      });
    }
  }
  await testInfo.attach("真实模块用色清单", {
    body: JSON.stringify(
      { defined: Object.keys(palette), used: [...used], byModule },
      null,
      2,
    ),
    contentType: "application/json",
  });
  expect([...used].sort()).toEqual(Object.keys(palette).sort());
  expect(used.size).toBeGreaterThanOrEqual(20);
  expect(errors).toEqual([]);
});
