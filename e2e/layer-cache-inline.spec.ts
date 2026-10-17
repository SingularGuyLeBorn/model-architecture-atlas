import { test, expect, type Page, type Locator } from "@playwright/test";

async function settled(page: Page) {
  let prior = "",
    n = 0;
  await expect
    .poll(
      async () => {
        const value = await page
          .locator(".react-flow__viewport")
          .getAttribute("style");
        n = value === prior ? n + 1 : 0;
        prior = value ?? "";
        return n;
      },
      { intervals: [100, 150, 200] },
    )
    .toBeGreaterThanOrEqual(3);
}
async function noOverflow(node: Locator) {
  await expect(node.locator(".katex-error")).toHaveCount(0);
  await expect
    .poll(() =>
      node.locator("div,section").evaluateAll((els) =>
        els
          .filter(
            (el) =>
              el.clientWidth > 0 &&
              !el.classList.contains("react-flow__handle") &&
              !el.hasAttribute("data-boundary-connectable") &&
              // 端口圆心在边界上，命中区有意越过外框；检查其余真实内容子框。
              !Array.from(el.children).some((child) =>
                child.classList.contains("react-flow__handle"),
              ) &&
              el.scrollWidth > el.clientWidth + 2,
          )
          .filter((el) => {
            const bounds = el.getBoundingClientRect();
            const tolerance = (bounds.width / el.clientWidth) * 2;
            // scrollWidth 还会计入后代端口的命中区；只把实际内容越界判为溢出。
            return Array.from(el.querySelectorAll("div,section,p,span")).some(
              (child) =>
                !child.closest(".react-flow__handle") &&
                child.getBoundingClientRect().right > bounds.right + tolerance,
            );
          })
          .map((el) => ({
            tag: el.tagName,
            class: el.className,
            width: el.clientWidth,
            scroll: el.scrollWidth,
            text: el.textContent?.slice(0, 60),
          })),
      ),
    )
    .toEqual([]);
}
test("逐层实际入口定义别名，窗口淘汰、取行与 Attention 连续可读", async ({
  page,
}) => {
  test.setTimeout(300000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 2200, height: 1800 });
  await page.goto("/?revision=inspector-prose#model=v41&chapter=layer");
  await page.getByRole("button", { name: "收起左栏", exact: true }).click();
  await page
    .getByRole("button", { name: "Decode · 单步一行", exact: true })
    .click();
  const focus = page.getByRole("combobox", { name: "定位模块" });
  for (const layer of [1, 2, 3, 4, 21, 25, 26, 40]) {
    await page
      .getByRole("button", { name: String(layer), exact: true })
      .click();
    await expect(page.locator('[data-id="cache-sharing"]')).toHaveCount(0);
    for (const id of [
      "swa-window",
      ...(layer > 2 ? ["compressor", "indexer", "global-select"] : []),
      "kv-merge",
    ]) {
      await focus.selectOption(id);
      await settled(page);
      const node = page.locator('.react-flow__node[data-id="' + id + '"]');
      await expect(node).toBeVisible();
      if (id === "swa-window") {
        await expect(
          node.locator('[data-previous-token="t-128"]'),
        ).toHaveAttribute("aria-label", "淘汰");
        await expect(
          node.locator('[data-selection-window] [data-window-token="t-128"]'),
        ).toHaveCount(0);
        await expect(node.locator('[data-window-token="t"]')).toHaveAttribute(
          "data-window-state",
          "new",
        );
        await expect(node.locator("[data-window-bracket]")).toContainText(
          "128 行",
        );
        await expect(node.locator("[data-ring-cache]")).toHaveCount(0);
      }
      if (id === "compressor") {
        if ([3, 21].includes(layer)) {
          await expect(
            node.locator("[data-compressor-projections]"),
          ).toHaveCount(1);
          await expect(
            node.locator("[data-projection-weight]").first(),
          ).toContainText("KV,G");
        } else {
          await expect(
            node.locator('[data-cache-reference="G"]'),
          ).toHaveAttribute("data-reference-source", layer === 4 ? "3" : "21");
          await expect(
            node.locator("[data-compressor-projections]"),
          ).toHaveCount(0);
        }
      }
      if (id === "indexer") {
        if ([4, 26, 40].includes(layer)) {
          await expect(
            node.locator('[data-cache-reference="I"]'),
          ).toHaveAttribute(
            "data-reference-source",
            layer === 4 ? "3" : layer === 26 ? "25" : "37",
          );
          await expect(node.locator("[data-index-projections]")).toHaveCount(0);
        } else {
          await expect(node.locator("[data-index-projections]")).toHaveCount(1);
          if ([3, 21].includes(layer)) {
            const keyProjection = node.locator(
              '[data-index-projection="压缩潜向量 → 索引 Key"]',
            );
            await expect(keyProjection).toContainText("旧 Key 直接保留");
            await expect(
              keyProjection.locator('[aria-label="1\\\\times512"]'),
            ).toHaveCount(1);
            await expect(node.locator("[data-index-key-append]")).toContainText(
              "旧行原样保留",
            );
            const keyFormulas = await node
              .locator("[data-index-key-append] annotation")
              .allTextContents();
            expect(keyFormulas).toContain("M_{old}\\times128");
            expect(keyFormulas).toContain("\\downarrow");
          }
          await expect(node.locator("[data-index-score-axes]")).toContainText(
            "被评分",
          );
        }
      }
      await node.screenshot({ path: "artifacts/per-layer-current.png" });
      await noOverflow(node);
      const height = await node.evaluate(
        (el) => (el as HTMLElement).offsetHeight,
      );
      await page.setViewportSize({
        width: 2200,
        height: Math.ceil(height + 700),
      });
      await focus.selectOption(id);
      await settled(page);
      await node.screenshot({
        path: "artifacts/per-layer-" + layer + "-" + id + ".png",
      });
      await page.setViewportSize({ width: 2200, height: 1800 });
    }
  }
  for (const phase of ["Prefill · 整段矩阵", "Decode · 单步一行"]) {
    await page.getByRole("button", { name: phase, exact: true }).click();
    await page.getByRole("button", { name: "25", exact: true }).click();
    for (const id of ["kv", "q", "heads"]) {
      await focus.selectOption(id);
      await settled(page);
      const node = page.locator('.react-flow__node[data-id="' + id + '"]');
      await noOverflow(node);
      if (id === "kv") {
        await expect(node.locator("[data-local-cache-meaning]")).toContainText(
          "T · 本批新算 KV",
        );
        await expect(node).toContainText("KV,");
      }
      const height = await node.evaluate(
        (el) => (el as HTMLElement).offsetHeight,
      );
      await page.setViewportSize({
        width: 2200,
        height: Math.ceil(height + 700),
      });
      await focus.selectOption(id);
      await settled(page);
      await node.screenshot({
        path:
          "artifacts/per-layer-25-" +
          id +
          "-" +
          (phase.startsWith("Decode") ? "decode" : "prefill") +
          ".png",
      });
      await page.setViewportSize({ width: 2200, height: 1800 });
    }
  }
  await page.setViewportSize({ width: 900, height: 1200 });
  await focus.selectOption("swa-window");
  await settled(page);
  await noOverflow(page.locator('.react-flow__node[data-id="swa-window"]'));
  await page.screenshot({ path: "artifacts/per-layer-narrow.png" });
  expect(errors).toEqual([]);
});
