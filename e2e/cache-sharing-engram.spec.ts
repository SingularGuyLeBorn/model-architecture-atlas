import { test, expect, type Page } from "@playwright/test";
import { cacheSourceSummary } from "../src/components/CacheSemantics";

async function canvasSettled(page: Page) {
  let previous = "";
  let same = 0;
  await expect
    .poll(
      async () => {
        const current = await page
          .locator(".react-flow__viewport")
          .getAttribute("style");
        same = current === previous ? same + 1 : 0;
        previous = current ?? "";
        return same;
      },
      { intervals: [100, 150, 200], timeout: 10000 },
    )
    .toBeGreaterThanOrEqual(3);
}

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
    await canvasSettled(page);
    const map = page.locator("[data-cache-sharing-map]");
    const mapHeight = await map.evaluate(
      (el) => (el as HTMLElement).offsetHeight,
    );
    await page.setViewportSize({
      width: 2200,
      height: Math.ceil(mapHeight + 650),
    });
    await focus.selectOption("cache-sharing");
    await canvasSettled(page);
    await expect(map).toBeVisible();
    await expect(map.locator("[data-sharing-g]")).toHaveCount(4);
    await expect(map.locator("[data-sharing-index]")).toHaveCount(8);
    await expect(map.locator("[data-sharing-consumer]")).toHaveCount(30);
    await expect(map.locator("[data-reindex-branch]")).toHaveCount(4);
    await expect(map).toContainText("16384");
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
    await page.setViewportSize({ width: 2200, height: 1700 });
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
    await canvasSettled(page);
    const purpose = node.locator("[data-engram-purpose]");
    await expect(purpose).toContainText("mHC · Attention");
    await expect(purpose).toContainText("I | love | New | York");
    await expect(purpose).not.toContainText("计算账本");
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

test("Full 与四个 Reindex 的真实选行节点显式应用共享候选，旁注同步", async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 2200, height: 2000 });
  await page.goto("/?revision=inspector-prose#model=v41&chapter=layer");
  await page.getByRole("button", { name: "收起左栏", exact: true }).click();
  for (const phase of ["Prefill · 整段矩阵", "Decode · 单步一行"]) {
    await page.getByRole("button", { name: phase, exact: true }).click();
    for (const layer of [21, 25, 29, 33, 37]) {
      await page
        .getByRole("button", { name: String(layer), exact: true })
        .click();
      await page
        .getByRole("combobox", { name: "定位模块" })
        .selectOption("indexer");
      const node = page.locator('.react-flow__node[data-id="indexer"]');
      const nodeHeight = await node.evaluate(
        (el) => (el as HTMLElement).offsetHeight,
      );
      await page.setViewportSize({
        width: 2200,
        height: Math.ceil(nodeHeight + 650),
      });
      await page
        .getByRole("combobox", { name: "定位模块" })
        .selectOption("indexer");
      await canvasSettled(page);
      const filter = node.locator("[data-candidate-filter]");
      await expect(filter).toHaveAttribute(
        "data-candidate-filter",
        String(layer),
      );
      await expect(filter).toContainText("B₂₁,t");
      await expect(node.locator(".katex-error")).toHaveCount(0);
      await expect
        .poll(() =>
          filter
            .locator("div,section")
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
      await filter.screenshot({
        path:
          "artifacts/candidate-" +
          layer +
          "-" +
          (phase.startsWith("Decode") ? "decode" : "prefill") +
          ".png",
      });
    }
  }
  await page
    .getByRole("combobox", { name: "定位模块" })
    .selectOption("cache-sharing");
  await canvasSettled(page);
  const example = page.locator("[data-reindex-candidates]");
  await example.screenshot({ path: "artifacts/reindex-shared-example.png" });
  await example.locator("> strong").click();
  await expect(page.getByLabel("模块解释", { exact: true })).toContainText(
    "同一份候选掩码",
  );
});
