import { expect, test } from "@playwright/test";

test("变量跨层查找与 Prefill 窗口展开", async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1800, height: 1350 });
  await page.goto("/#model=v41&chapter=layer");
  await page.getByRole("button", { name: "收起左栏", exact: true }).click();
  const search = page.getByRole("textbox", { name: "按变量名查找" });
  await search.fill("KV₃,t");
  await page
    .locator(
      '[data-variable-result][data-variable-layer="3"][data-variable-node="kv-merge"]',
    )
    .first()
    .click();
  await expect(page.locator(".architecture-flow")).toHaveAttribute(
    "data-render-layer",
    "3",
  );
  const concat = page.locator('.react-flow__node[data-id="kv-merge"]');
  await expect(concat.locator("[data-concat-row]")).toHaveCount(12);
  await expect
    .poll(async () => (await concat.boundingBox())!.y)
    .toBeGreaterThan(0);
  for (const layer of [1, 3, 4, 25]) {
    await search.fill(`U_${layer},t`);
    await page
      .locator(
        `[data-variable-result][data-variable-layer="${layer}"][data-variable-node="swa-window"]`,
      )
      .first()
      .click();
    const result = page.locator('.react-flow__node[data-id="swa-result"]');
    await expect(result.locator("[data-window-matrix]")).toHaveCount(1);
    await expect(result.locator(`[aria-label="u_{${layer},r,1}"]`)).toHaveCount(
      1,
    );
    await expect(
      result.locator(`[aria-label="u_{${layer},t,512}"]`),
    ).toHaveCount(1);
    await expect
      .poll(async () => {
        const parent = (await page
          .locator('.react-flow__node[data-id="swa-window"]')
          .boundingBox())!;
        const child = (await result.boundingBox())!;
        return parent.y + parent.height - child.y - child.height;
      })
      .toBeGreaterThanOrEqual(0);
    await expect(result.locator(".katex-error")).toHaveCount(0);
    if (layer === 1) {
      const rect = (await page
        .locator('.react-flow__node[data-id="swa-window"]')
        .boundingBox())!;
      await page.screenshot({
        path: "artifacts/prefill-window-expanded.png",
        clip: rect,
      });
    }
  }
  await page
    .getByRole("button", { name: "Decode · 单步一行", exact: true })
    .click();
  await search.fill("U_1,t");
  await page
    .locator(
      '[data-variable-result][data-variable-layer="1"][data-variable-node="swa-window"]',
    )
    .first()
    .click();
  await expect(page.locator(".architecture-flow")).toHaveAttribute(
    "data-render-phase",
    "decode",
  );
  await expect(page.locator("[data-swa-result]")).toHaveCount(0);
});
