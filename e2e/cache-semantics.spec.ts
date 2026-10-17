import { test, expect } from "@playwright/test";
import {
  cachePolicy,
  cacheSourceSummary,
} from "../src/components/CacheSemantics";

test("缓存来源、三模式及 Full 历史追加：图、旁注与边界一致", async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 2200, height: 1800 });
  await page.goto("/#model=v41&chapter=layer");
  await page.getByRole("button", { name: "收起左栏", exact: true }).click();
  const focus = page.getByRole("combobox", { name: "定位模块" });
  for (const layer of [3, 4, 9, 21, 25, 26, 40]) {
    await page
      .getByRole("button", { name: String(layer), exact: true })
      .click();
    for (const phase of ["Prefill · 整段矩阵", "Decode · 单步一行"]) {
      await page.getByRole("button", { name: phase, exact: true }).click();
      for (const id of ["kv", "compressor"]) {
        await focus.selectOption(id);
        const node = page.locator(`.react-flow__node[data-id="${id}"]`);
        await expect(node).toBeVisible();
        if (id === "kv")
          await expect(
            node.locator("[data-local-cache-meaning]"),
          ).toBeVisible();
        else {
          // 三模式说明已移到来源摘要和旁注；主图只保留当前层真实生成/引用路径。
          await expect(page.locator("[data-layer-cache-source]")).toContainText(
            cacheSourceSummary(layer),
          );
          if (cachePolicy(layer).mode === "Full")
            await expect(node).toContainText("本层独立全局参数");
          else
            await expect(
              node.locator('[data-cache-reference="G"]'),
            ).toBeVisible();
        }
        await expect
          .poll(() =>
            node
              .locator("div,section,td")
              .evaluateAll((items) =>
                items
                  .filter(
                    (el) =>
                      el.clientWidth > 0 &&
                      !el.querySelector(".react-flow__handle") &&
                      el.scrollWidth > el.clientWidth + 2,
                  )
                  .map((el) => el.textContent?.slice(0, 60)),
              ),
          )
          .toEqual([]);
        await expect(node.locator(".katex-error")).toHaveCount(0);
        if (id === "kv" && layer === 3 && phase.startsWith("Decode"))
          await node
            .locator("[data-local-cache-meaning]")
            .screenshot({ path: "artifacts/cache-local-source.png" });
        if (id === "compressor") {
          await expect(node.locator("[data-global-history]")).toHaveCount(
            [3, 9, 21].includes(layer) && phase.startsWith("Decode") ? 1 : 0,
          );
          if (phase.startsWith("Decode"))
            await node.screenshot({
              path: `artifacts/cache-mode-${layer}.png`,
            });
          if (layer === 3 && phase.startsWith("Decode")) {
            const height = await node.evaluate(
              (el) => (el as HTMLElement).offsetHeight,
            );
            await page.setViewportSize({
              width: 2200,
              height: Math.ceil(height + 600),
            });
            await focus.selectOption(id);
            await node.screenshot({ path: "artifacts/cache-full-module.png" });
            await node
              .locator("[data-global-history]")
              .screenshot({ path: "artifacts/cache-history.png" });
            await page.setViewportSize({ width: 2200, height: 1800 });
          }
        }
      }
    }
  }
  await page.setViewportSize({ width: 900, height: 1400 });
  await focus.selectOption("compressor");
  await page
    .locator(
      '.react-flow__node[data-id="compressor"] [data-cache-reference="G"]',
    )
    .click();
  await expect(page.getByLabel("模块解释", { exact: true })).toContainText(
    "不重算全部历史",
  );
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .map((animation) => animation.finished.catch(() => {})),
    ),
  );
  await expect
    .poll(() =>
      page
        .locator(
          ".inspector-rail,.inspector-slide-body,.module-inspector,.inspector-prose",
        )
        .evaluateAll((items) =>
          items.every(
            (el) =>
              el.scrollWidth <= el.clientWidth + 1 &&
              el.getBoundingClientRect().right <= innerWidth + 1,
          ),
        ),
    )
    .toBe(true);
  await page.screenshot({ path: "artifacts/cache-semantics-narrow.png" });
});
