import { expect, test } from "@playwright/test";

test("白色画布与透明矩阵外框保留元素色和选择高亮", async ({ page }) => {
  await page.setViewportSize({ width: 2400, height: 1800 });
  await page.goto("/#model=v41&chapter=layer");
  await expect(page.locator(".full-layer")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  const focus = page.getByRole("combobox", { name: "定位模块" });
  for (const id of ["q", "kv", "experts", "hc-mix-a", "router", "scores"]) {
    const values = await focus
      .locator("option")
      .evaluateAll((nodes) => nodes.map((n) => (n as HTMLOptionElement).value));
    expect(values).toContain(id);
    await focus.selectOption(id);
    const module = page.locator(`.react-flow__node[data-id="${id}"]`);
    const frames =
      id === "q"
        ? page.locator(
            '.react-flow__node[data-id^="q-"] [data-expanded-tensor]',
          )
        : module.locator("[data-expanded-tensor]");
    await expect(frames.first()).toBeAttached();
    expect(await frames.count()).toBeGreaterThan(0);
    for (const frame of await frames.all())
      await expect(frame).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await module.screenshot({ path: `artifacts/white-${id}.png` });
    if (id === "experts")
      await module
        .locator("[data-expert-structure]")
        .first()
        .screenshot({ path: "artifacts/white-expert-detail.png" });
  }
  await page
    .getByRole("button", { name: "Decode · 单步一行", exact: true })
    .click();
  await focus.selectOption("experts");
  for (const frame of await page.locator("[data-expert-matrix]").all())
    await expect(frame).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(page.locator(".katex-error")).toHaveCount(0);
});
