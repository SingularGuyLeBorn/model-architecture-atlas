import { test, expect } from "@playwright/test";

test("四路复制、单次子层计算与系数用途可直接读图和旁注", async ({ page }) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 2400, height: 2200 });
  await page.goto("/#model=v41&chapter=layer");
  const focus = page.getByRole("combobox", { name: "定位模块" });
  for (const layer of [1, 3, 15, 40]) {
    await page
      .getByRole("button", { name: String(layer), exact: true })
      .click();
    await page
      .getByRole("button", {
        name: layer === 40 ? "Decode · 单步一行" : "Prefill · 整段矩阵",
        exact: true,
      })
      .click();
    for (const id of [
      "hc-expand",
      "hc-pre-a",
      "hc-pre-f",
      "norm1",
      "norm2",
      "hc-mix-a",
      "hc-mix-f",
      "add1",
      "add2",
      "heads",
      "experts",
    ]) {
      await focus.selectOption(id);
      const node = page.locator(`.react-flow__node[data-id="${id}"]`);
      await expect(node.locator("[data-detail-suspended]")).toHaveCount(0);
      if (id === "hc-expand") {
        await expect(node.locator("[data-mhc-initial-copy]")).toHaveCount(4);
        await expect(node).toContainText("复制四份完整向量");
        for (const copy of await node
          .locator("[data-mhc-initial-copy]")
          .all()) {
          await expect(copy.locator('[aria-label="E_{t,5120}"]')).toHaveCount(
            1,
          );
        }
      } else if (id.startsWith("hc-pre")) {
        const sub = id.endsWith("a") ? "A" : "F";
        await expect(node.locator("[data-mhc-matmul]")).toHaveCount(1);
        await expect(
          node.locator(`[aria-label="Z_{${layer}}^{${sub}}"]`).first(),
        ).toBeVisible();
        await expect(
          node.getByLabel("4\\times5120", { exact: true }),
        ).toHaveCount(1);
        await expect(node.locator("[data-mhc-single-pass]")).toContainText(
          "只计算一次",
        );
        const weights = await node
          .locator("[data-mhc-pre-weights]")
          .boundingBox();
        const note = await node.locator("[data-mhc-single-pass]").boundingBox();
        expect(note!.y).toBeGreaterThan(weights!.y + weights!.height);
      } else if (id.startsWith("norm")) {
        const sub = id === "norm1" ? "A" : "F";
        await expect(
          node.locator(`[aria-label="Z_{${layer}}^{${sub}}"]`),
        ).toBeVisible();
      } else if (id.startsWith("hc-mix")) {
        await expect(
          node.locator("[data-mhc-coefficient-origin]"),
        ).toContainText("动态计算");
      } else if (id.startsWith("add")) {
        await expect(node.locator("[data-mhc-writeback-origin]")).toContainText(
          "同时生成的 p 送往",
        );
      } else {
        await expect(
          node.locator(
            id === "heads"
              ? "[data-attention-single-pass]"
              : "[data-ffn-single-pass]",
          ),
        ).toContainText("只计算一次");
      }
      const overflow = await node
        .locator("div,section,p")
        .evaluateAll((els) =>
          els
            .filter(
              (el) =>
                el.clientWidth > 0 &&
                !el.querySelector(".react-flow__handle") &&
                el.scrollWidth > el.clientWidth + 2,
            )
            .map((el) => el.textContent?.slice(0, 80)),
        );
      expect(overflow, `${layer}/${id}`).toEqual([]);
      if (
        [1, 3].includes(layer) &&
        !["heads", "experts", "add1", "add2"].includes(id)
      ) {
        await node.screenshot({
          path: `artifacts/mhc-reading-${layer}-${id}.png`,
        });
      }
    }
  }
  await page.getByRole("button", { name: "1", exact: true }).click();
  await focus.selectOption("hc-expand");
  await page.locator("[data-mhc-initialization] [data-module-title]").click();
  const pane = page.getByRole("complementary", { name: "模块解释" });
  await expect(pane).toContainText("完整复制四份");
  await expect(pane).toContainText("只计算一次");
  await pane.screenshot({
    path: "artifacts/mhc-reading-initialization-note.png",
  });
  await focus.selectOption("hc-mix-a");
  await page.locator('[data-mhc-mix="A"] > [data-module-title]').click();
  await expect(pane).toContainText("具体系数随层、token 和残差内容动态计算");
  await pane.screenshot({ path: "artifacts/mhc-reading-coefficient-note.png" });
  await expect(page.locator(".katex-error")).toHaveCount(0);
  expect(errors).toEqual([]);
});
