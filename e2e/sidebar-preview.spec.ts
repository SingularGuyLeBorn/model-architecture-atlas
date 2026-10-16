import { test, expect } from "@playwright/test";

test("左右栏悬停预览、导航收回、固定展开与扩展缩放", async ({ page }) => {
  await page.goto("/#model=v41&chapter=layer");
  await expect(page.getByRole("combobox", { name: "定位模块" })).toBeVisible();
  await page.getByRole("button", { name: "收起左栏", exact: true }).click();
  const left = page.getByRole("button", { name: "固定展开左栏", exact: true });
  await page.mouse.move(700, 150);
  await expect(page.locator(".sidebar")).toBeHidden();
  await left.hover();
  await expect(page.locator(".sidebar")).toBeVisible();
  await page
    .getByRole("navigation", { name: "章节选择" })
    .getByRole("button")
    .first()
    .click();
  await expect(page.locator(".sidebar")).toBeHidden();
  await left.hover();
  await left.click();
  await page.mouse.move(700, 150);
  await expect(page.locator(".sidebar")).toBeVisible();
  await page.goto("/#model=v41&chapter=layer");
  await page.getByRole("button", { name: "15", exact: true }).click();
  await page
    .getByRole("combobox", { name: "定位模块" })
    .selectOption("hc-mix-f");
  const trigger = page.getByRole("button", {
    name: "固定展开右栏",
    exact: true,
  });
  await trigger.hover();
  await expect(page.locator("[data-module-inspector]")).toBeVisible();
  await page.locator("[data-module-inspector]").hover();
  await expect(page.locator("[data-module-inspector]")).toBeVisible();
  await page.screenshot({ path: "artifacts/sidebar-preview.png" });
  await page.mouse.move(700, 150);
  await expect(page.locator("[data-module-inspector]")).toBeHidden();
  await trigger.click();
  await page.mouse.move(700, 150);
  await expect(page.locator("[data-module-inspector]")).toBeVisible();
  await page.getByRole("button", { name: "关闭模块解释" }).click();
  const zoom = () =>
    page
      .locator(".react-flow__viewport")
      .evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);
  for (
    let n = 0;
    n < 30 &&
    !(await page.locator(".react-flow__controls-zoomin").isDisabled());
    n++
  ) {
    await page.locator(".react-flow__controls-zoomin").click();
    await page.waitForTimeout(220);
  }
  await expect.poll(zoom).toBeCloseTo(8, 1);
  for (
    let n = 0;
    n < 45 &&
    !(await page.locator(".react-flow__controls-zoomout").isDisabled());
    n++
  ) {
    await page.locator(".react-flow__controls-zoomout").click();
    await page.waitForTimeout(220);
  }
  await expect.poll(zoom).toBeCloseTo(0.02, 2);
  await page
    .getByRole("combobox", { name: "定位模块" })
    .selectOption("hc-mix-f");
  await page.setViewportSize({ width: 3000, height: 2600 });
  await page
    .getByRole("combobox", { name: "定位模块" })
    .selectOption("hc-mix-f");
  await page
    .locator('[data-id="hc-mix-f"] [data-mhc-sinkhorn]')
    .screenshot({ path: "artifacts/sinkhorn-semantic-colors.png" });
  await expect(page.locator(".katex-error")).toHaveCount(0);
});
