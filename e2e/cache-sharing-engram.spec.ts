import { test, expect } from "@playwright/test";
import { cacheSourceSummary } from "../src/components/CacheSemantics";

test("逐层主图的完整共享区间、Engram 收益及旁注可读且无溢出", async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.setViewportSize({ width: 2200, height: 1700 });
  await page.goto("/?revision=inspector-prose#model=v41&chapter=layer");
  await page.getByRole("button", { name: "收起左栏", exact: true }).click();
  const focus = page.getByRole("combobox", { name: "定位模块" });
  for (const layer of [
    1, 3, 8, 9, 14, 15, 20, 21, 24, 25, 28, 29, 32, 33, 36, 37, 40,
  ]) {
    await page
      .getByRole("button", { name: String(layer), exact: true })
      .click();
    await expect(page.locator("[data-layer-cache-source]")).toContainText(
      cacheSourceSummary(layer),
    );
  }
  for (const layer of [8, 26, 40]) {
    await page
      .getByRole("button", { name: String(layer), exact: true })
      .click();
    await focus.selectOption("cache-sharing");
    const map = page.locator("[data-cache-sharing-map]");
    await expect(map).toBeVisible();
    await expect(map.locator("[data-sharing-g]")).toHaveCount(4);
    await expect(map.locator("[data-sharing-index]")).toHaveCount(8);
    await expect(map.locator("[data-sharing-consumer]")).toHaveCount(30);
    await expect(map.locator("[data-active-sharing]")).toContainText(
      `第 ${layer} 层`,
    );
    await expect
      .poll(() =>
        map
          .locator("div,td,strong")
          .evaluateAll((els) =>
            els
              .filter(
                (el) =>
                  el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 2,
              )
              .map((el) => el.textContent?.slice(0, 50)),
          ),
      )
      .toEqual([]);
    await expect(map.locator(".katex-error")).toHaveCount(0);
    await map.screenshot({ path: `artifacts/sharing-layer${layer}.png` });
  }
  for (const layer of [2, 15]) {
    await page
      .getByRole("button", { name: String(layer), exact: true })
      .click();
    await page
      .getByRole("button", { name: "Decode · 单步一行", exact: true })
      .click();
    await focus.selectOption("engram-lookup");
    const node = page.locator('.react-flow__node[data-id="engram-lookup"]');
    const height = await node.evaluate(
      (el) => (el as HTMLElement).offsetHeight,
    );
    await page.setViewportSize({
      width: 2200,
      height: Math.ceil(height + 650),
    });
    await focus.selectOption("engram-lookup");
    const purpose = node.locator("[data-engram-purpose]");
    await expect(purpose).toContainText("没有跳过这些模块");
    await expect
      .poll(() =>
        node
          .locator("div,section")
          .evaluateAll((els) =>
            els
              .filter(
                (el) =>
                  el.clientWidth > 0 &&
                  !el.querySelector(".react-flow__handle") &&
                  el.scrollWidth > el.clientWidth + 2,
              )
              .map((el) => el.textContent?.slice(0, 50)),
          ),
      )
      .toEqual([]);
    await expect(node.locator(".katex-error")).toHaveCount(0);
    await purpose.screenshot({
      path: `artifacts/engram-purpose-layer${layer}.png`,
    });
    await node.screenshot({
      path: `artifacts/engram-lookup-layer${layer}.png`,
    });
    await page.setViewportSize({ width: 2200, height: 1700 });
  }
  await page.setViewportSize({ width: 900, height: 1400 });
  await focus.selectOption("engram-lookup");
  await page.locator("[data-engram-purpose] > strong").click();
  await expect(page.getByLabel("模块解释", { exact: true })).toContainText(
    "释放有效网络深度",
  );
  await expect
    .poll(() =>
      page
        .locator(".module-inspector,.inspector-prose")
        .evaluateAll((els) =>
          els.every((el) => el.scrollWidth <= el.clientWidth + 1),
        ),
    )
    .toBe(true);
  await page.screenshot({ path: "artifacts/engram-purpose-narrow.png" });
  await page.setViewportSize({ width: 2200, height: 1700 });
  await page.goto("/#model=v41&chapter=engram");
  const standalone = page.locator("[data-engram-purpose]");
  await expect(standalone).toBeVisible();
  await expect
    .poll(() =>
      standalone
        .locator("div")
        .evaluateAll((els) =>
          els
            .filter(
              (el) => el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 2,
            )
            .map((el) => el.textContent?.slice(0, 50)),
        ),
    )
    .toEqual([]);
  await standalone.screenshot({ path: "artifacts/engram-purpose-chapter.png" });
  expect(errors).toEqual([]);
});
