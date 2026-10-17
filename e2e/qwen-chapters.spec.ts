import { test, expect } from "@playwright/test";

test("Qwen 两种注意力章节始终进入配置允许的层", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/#model=qwen38&chapter=qsa");
  const layer = page.getByRole("combobox", { name: "层", exact: true });
  await expect(layer).toHaveValue("4");
  await expect(layer.locator("option")).toHaveCount(12);
  await layer.selectOption("48");
  await expect(page.locator('[data-stage="input"]')).toContainText("Layer 48");
  await page
    .getByRole("navigation", { name: "章节选择" })
    .getByRole("button", { name: /GDN/ })
    .click();
  await expect(layer).toHaveValue("1");
  await expect(layer.locator("option")).toHaveCount(36);
  await layer.selectOption("47");
  await page
    .getByRole("navigation", { name: "章节选择" })
    .getByRole("button", { name: /QSA/ })
    .click();
  await expect(layer).toHaveValue("4");
  await expect(page.locator('[data-stage="input"]')).toContainText("Layer 4");
  expect(errors).toEqual([]);
});
