import { test, expect } from "@playwright/test";
import { CACHE_STEPS } from "../src/components/CacheDecodeExample";

test("原逐层 URL 直接显示两步缓存实例，Full 与 Reuse 的 ID 一致", async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.setViewportSize({ width: 2200, height: 1800 });
  await page.goto("/?revision=inspector-prose#model=v41&chapter=layer");
  await page.getByRole("button", { name: "收起左栏", exact: true }).click();
  const focus = page.getByRole("combobox", { name: "定位模块" });
  for (const layer of [3, 4]) {
    await page
      .getByRole("button", { name: String(layer), exact: true })
      .click();
    await page
      .getByRole("button", { name: "Decode · 单步一行", exact: true })
      .click();
    await expect(page.locator("[data-inline-cache-hint]")).toContainText(
      "本页各缓存模块已展开",
    );
    for (const [id, part] of [
      ["kv", "local"],
      ["compressor", "global"],
      ["indexer", "index"],
      ["global-select", "selected"],
      ["kv-merge", "concat"],
    ]) {
      await focus.selectOption(id);
      const node = page.locator(`.react-flow__node[data-id="${id}"]`);
      const example = node.locator(`[data-layer-cache-example="${part}"]`);
      await expect(example).toHaveCount(1);
      await expect(example.locator("[data-layer-cache-token]")).toHaveCount(2);
      await expect(node.locator(".katex-error")).toHaveCount(0);
      await expect
        .poll(() =>
          example.locator("div,section,td").evaluateAll((items) =>
            items
              .filter(
                (el) =>
                  el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 2,
              )
              .map((el) => ({
                text: el.textContent?.slice(0, 70),
                width: el.clientWidth,
                scroll: el.scrollWidth,
              })),
          ),
        )
        .toEqual([]);
      if (id === "indexer") {
        for (const step of CACHE_STEPS) {
          const block = example.locator(
            `[data-layer-cache-token="${step.token}"]`,
          );
          await expect(
            block.locator(
              layer === 3 ? "[data-selected-ids]" : "[data-reused-ids]",
            ),
          ).toHaveAttribute(
            layer === 3 ? "data-selected-ids" : "data-reused-ids",
            step.ids.join(","),
          );
          if (layer === 3) {
            await expect(block.locator('[data-rank="512"]')).toHaveAttribute(
              "data-selected",
              "true",
            );
            await expect(block.locator('[data-rank="513"]')).toHaveAttribute(
              "data-selected",
              "false",
            );
          }
        }
      }
      // 截图直接来自用户指定的逐层页；放大视口容纳整框，不改变图内尺寸。
      const height = await node.evaluate(
        (el) => (el as HTMLElement).offsetHeight,
      );
      await page.setViewportSize({
        width: 2200,
        height: Math.ceil(height + 700),
      });
      await focus.selectOption(id);
      await node.screenshot({
        path: `artifacts/inline-layer${layer}-${id}.png`,
      });
      await example.screenshot({
        path: `artifacts/inline-layer${layer}-${id}-detail.png`,
      });
      await page.setViewportSize({ width: 2200, height: 1800 });
      if (id === "indexer") {
        await focus.selectOption(id);
        const detailBox = (await example.boundingBox())!;
        await page.mouse.move(2100, 600);
        await page.mouse.wheel(0, detailBox.y - 400);
        await expect(example).toBeInViewport();
        await page.screenshot({
          path: `artifacts/inline-layer${layer}-page.png`,
        });
      }
      await expect(page).toHaveURL(
        /revision=inspector-prose#model=v41&chapter=layer$/,
      );
    }
    await page
      .getByRole("button", { name: "Prefill · 整段矩阵", exact: true })
      .click();
    await focus.selectOption("indexer");
    await expect(
      page.locator('[data-id="indexer"] [data-layer-cache-example]'),
    ).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});
