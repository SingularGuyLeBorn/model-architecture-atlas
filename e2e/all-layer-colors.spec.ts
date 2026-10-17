import { test, expect } from "@playwright/test";
import { COLORS, selectionPalette } from "../src/components/diagram-primitives";

test("40 层 × 两种阶段：真实数据颜色、来源和消费端连续", async ({
  page,
}, testInfo) => {
  test.setTimeout(900000);
  await page.setViewportSize({ width: 4000, height: 3400 });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/#model=v41&chapter=layer");
  await page.getByRole("button", { name: "收起左栏", exact: true }).click();
  const rgb = (hex: string) =>
    `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;
  const reports: {
    layer: number;
    phase: string;
    nodes: number;
    checks: number;
  }[] = [];
  const failures: string[] = [];
  for (let layer = 1; layer <= 40; layer++)
    for (const phase of ["prefill", "decode"]) {
      await page
        .getByRole("button", { name: String(layer), exact: true })
        .click();
      await page
        .getByRole("button", {
          name:
            phase === "prefill" ? "Prefill · 整段矩阵" : "Decode · 单步一行",
          exact: true,
        })
        .click();
      await expect(page.locator(".architecture-flow")).toHaveAttribute(
        "data-render-layer",
        String(layer),
      );
      await expect(page.locator(".architecture-flow")).toHaveAttribute(
        "data-render-phase",
        phase,
      );
      await page.locator(".react-flow__controls-fitview").click();
      await expect(
        page.locator("[data-detail-suspended], .katex-error"),
      ).toHaveCount(0);
      const rules: {
        selector: string;
        color: string;
        selected?: string;
        required: boolean;
      }[] = [];
      const role = (
        selector: string,
        tone: keyof typeof COLORS,
        required = true,
        selected?: string,
      ) =>
        rules.push({ selector, color: rgb(COLORS[tone]), required, selected });
      for (const side of ["input", "output"]) {
        role(
          `[data-concat-rows="local-${side}"] [data-concat-element]`,
          "greenSoft",
          layer > 2,
        );
        role(
          `[data-concat-rows="global-${side}"] [data-concat-element]`,
          "oceanSoft",
          layer > 2,
        );
      }
      // 省略号没有数据底色；仅检查真实 K/V 元素格。
      role(
        '[data-kv-row-tone="green"] > span:not([style*="transparent"])',
        "greenSoft",
      );
      role(
        '[data-kv-row-tone="ocean"] > span:not([style*="transparent"])',
        "oceanSoft",
        layer > 2,
      );
      role("[data-expert-weighted] [data-vector-cell]", "cyanSoft");
      role(
        "[data-expert-output] [data-vector-cell]",
        "greenSoft",
        true,
        rgb(selectionPalette("green").background),
      );
      role("[data-index-matmul-weight] [data-vector-cell]", "amberSoft", false);
      role("[data-index-matmul-scores] [data-vector-cell]", "oliveSoft", false);
      role("[data-index-matmul-result] [data-vector-cell]", "plumSoft", false);
      role(
        "[data-index-score-summary] [data-vector-cell]",
        "plumSoft",
        false,
        rgb(selectionPalette("plum").background),
      );
      role(
        "[data-selected-global-rows] [data-vector-cell]",
        "oceanSoft",
        layer > 2,
        rgb(selectionPalette("ocean", "amber").background),
      );
      role(
        '[data-rmsnorm="压缩 KV"] [data-rmsnorm-row-output] [data-vector-cell]',
        "oceanSoft",
        false,
      );
      const result = await page.evaluate(
        ({ rules }) => {
          const failures: string[] = [];
          let checks = 0;
          for (const rule of rules) {
            const cells = [...document.querySelectorAll(rule.selector)];
            if (rule.required && !cells.length)
              failures.push(`缺失 ${rule.selector}`);
            for (const el of cells) {
              const actual = getComputedStyle(el).backgroundColor;
              const expected =
                el.closest('[data-vector-selected="true"]') && rule.selected
                  ? rule.selected
                  : rule.color;
              checks++;
              if (actual !== expected)
                failures.push(`${rule.selector}: ${actual} != ${expected}`);
            }
          }
          return {
            failures,
            checks,
            nodes: document.querySelectorAll(".react-flow__node").length,
          };
        },
        { rules },
      );
      failures.push(...result.failures.map((s) => `L${layer} ${phase}: ${s}`));
      reports.push({
        layer,
        phase,
        nodes: result.nodes,
        checks: result.checks,
      });
      console.log(
        `L${layer} ${phase}: ${result.checks} 颜色断言，${result.failures.length} 异常`,
      );
      if (result.failures.length)
        console.log([...new Set(result.failures)].join("\n"));
    }
  await testInfo.attach("全40层颜色覆盖", {
    body: JSON.stringify({ reports, failures, errors }, null, 2),
    contentType: "application/json",
  });
  expect(reports).toHaveLength(80);
  expect(failures).toEqual([]);
  expect(errors).toEqual([]);
});
